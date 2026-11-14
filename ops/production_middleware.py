"""Preserve PIN flows while protecting private image delivery on the new host."""

import ipaddress
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath
import re
from urllib.parse import parse_qs,quote,unquote,urlsplit
import uuid

from django.conf import settings
from django.core import signing
from django.http import Http404,HttpResponse,JsonResponse
from django.utils.cache import patch_cache_control,patch_vary_headers

TTL=3600
PHOTO_SALT="avestudio.private-photo.v1"
ALBUM_SALT="avestudio.legacy-album.v1"
PUBLIC=("portfolio/","site/")


def private_headers(response):
    patch_cache_control(response,private=True,no_store=True,max_age=0)
    response["Referrer-Policy"]="no-referrer"
    patch_vary_headers(response,("Cookie",))
    return response


def canonical_path(value):
    if not isinstance(value,str) or not value or len(value)>2048 or any(ord(c)<32 for c in value):raise ValueError("Invalid media path")
    if "\\" in value or value.startswith("/") or str(PurePosixPath(value))!=value or ".." in PurePosixPath(value).parts:
        raise ValueError("Unsafe media path")
    return value


def media_path(url):
    parsed=urlsplit(url)
    if parsed.scheme and parsed.scheme not in {"http","https"}:raise ValueError("Invalid media scheme")
    if parsed.netloc:
        if parsed.username or parsed.password or parsed.hostname not in {*settings.ALLOWED_HOSTS,"backend","localhost","127.0.0.1"}:raise ValueError("Foreign media host")
    if not parsed.path.startswith("/media/"):raise ValueError("Expected media URL")
    return canonical_path(unquote(parsed.path.removeprefix("/media/"),errors="strict"))


def signable(relative):
    return relative.startswith(("client_albums/","thumbnails/")) or bool(re.fullmatch(r"schools/[0-9a-f-]{36}/(?:orig|web|thumb)/.+",relative))


def signed_url(url):
    relative=media_path(url)
    if relative.startswith(PUBLIC):return "/media/"+quote(relative,safe="/")
    if not signable(relative):raise ValueError("This media category cannot receive a public image link")
    token=signing.dumps({"path":relative},salt=PHOTO_SALT,compress=True)
    return "/media/"+quote(relative,safe="/")+"?access="+quote(token,safe="")


def staff(request):
    return bool(request.user.is_authenticated and request.user.is_active and request.user.is_staff)


def authorized(request,relative,query):
    canonical_path(relative)
    if relative.startswith(PUBLIC) or staff(request):return True
    if not signable(relative):return False
    values=parse_qs(query,keep_blank_values=True).get("access",[])
    if len(values)!=1 or len(values[0])>2048:return False
    try:return signing.loads(values[0],salt=PHOTO_SALT,max_age=TTL)=={"path":relative}
    except (signing.BadSignature,ValueError,TypeError):return False


def protected_media(request,path):
    try:
        relative=canonical_path(path)
        if not authorized(request,relative,request.META.get("QUERY_STRING","")):raise Http404
        root=Path(settings.MEDIA_ROOT).resolve();file=root/relative
        if file.is_symlink() or not file.resolve().is_relative_to(root) or not file.is_file():raise Http404
    except (ValueError,UnicodeError):raise Http404
    response=HttpResponse(content_type=mimetypes.guess_type(relative)[0] or "application/octet-stream")
    response["X-Accel-Redirect"]="/_private_media/"+quote(relative,safe="/")
    response["X-Content-Type-Options"]="nosniff"
    return private_headers(response)


def optimizer_authorization(request):
    try:
        uri=request.headers.get("X-Original-URI","")
        if not uri.startswith("/_next/image") or len(uri)>16384:raise ValueError
        values=parse_qs(urlsplit(uri).query,keep_blank_values=True).get("url",[])
        if len(values)!=1:raise ValueError
        url=values[0];parsed=urlsplit(url)
        if parsed.path.startswith("/media/"):
            public_hosts={settings.PRIMARY_HOST,"www."+settings.PRIMARY_HOST,"api.avestudio.ro","admin.avestudio.ro"}
            if parsed.netloc and (parsed.scheme!="https" or parsed.hostname not in public_hosts or parsed.port not in {None,443}):raise ValueError
            allowed=authorized(request,media_path(url),parsed.query)
        else:
            # Image optimization accepts this site's static image assets only.
            relative=canonical_path(unquote(parsed.path.removeprefix("/"),errors="strict"))
            allowed=not parsed.netloc and not parsed.scheme and not parsed.query and not relative.startswith(("api/","admin/","_private_media/")) and \
                    PurePosixPath(relative).suffix.lower() in {".png",".jpg",".jpeg",".webp",".avif",".gif",".ico",".svg"}
        return private_headers(HttpResponse(status=200 if allowed else 403))
    except (ValueError,UnicodeError,TypeError):return private_headers(HttpResponse(status=403))


class InternalProxyMiddleware:
    def __init__(self,get_response):
        self.get_response=get_response
        self.networks=[ipaddress.ip_network(value) for value in os.environ.get("RUNTIME_INTERNAL_CIDR","").split(",") if value]

    def __call__(self,request):
        host=request.get_host().split(":",1)[0]
        if host=="backend":
            try:remote=ipaddress.ip_address(request.META.get("REMOTE_ADDR",""))
            except ValueError:return HttpResponse(status=400)
            if not any(remote in net for net in self.networks):return HttpResponse(status=400)
            request.META["HTTP_HOST"]=settings.PRIMARY_HOST
            request.META["HTTP_X_FORWARDED_PROTO"]="https"
        return self.get_response(request)


class RuntimeMiddleware:
    def __init__(self,get_response):self.get_response=get_response

    def __call__(self,request):
        path=request.path
        if not settings.RUNTIME_BILLING_ENABLED and path.startswith(("/api/checkout/","/api/payments/")):
            return private_headers(JsonResponse({"detail":"Payments are temporarily unavailable."},status=503))
        if not settings.RUNTIME_DRIVE_ENABLED and path.startswith(("/api/google-drive/","/api/drive-albums/")):
            return private_headers(JsonResponse({"detail":"Drive access is temporarily unavailable."},status=503))
        if settings.PROJECT!="avestudio":return self.get_response(request)
        verified_input=None
        if path.rstrip("/")=="/api/verify-pin" and request.method=="POST":
            try:
                if int(request.META.get("CONTENT_LENGTH") or 0)>4096:return JsonResponse({"detail":"Request too large."},status=400)
                verified_input=json.loads(request.body)
                if not isinstance(verified_input,dict):raise ValueError
                verified_input["album_id"]=str(uuid.UUID(str(verified_input.get("album_id",""))))
            except (ValueError,UnicodeError,TypeError):return JsonResponse({"detail":"Invalid album request."},status=400)
        album_match=re.fullmatch(r"/api/albums/([0-9a-fA-F-]{36})/",path)
        if path=="/api/albums/" or album_match:
            if not staff(request):
                if not album_match:return private_headers(HttpResponse(status=404))
                try:identity=str(uuid.UUID(album_match[1]))
                except ValueError:return private_headers(HttpResponse(status=404))
                grant=request.get_signed_cookie("ave_album_"+identity,default="",salt=ALBUM_SALT,max_age=TTL)
                if grant!=identity:return private_headers(HttpResponse(status=404))
        response=self.get_response(request)
        if response.status_code!=200:return response
        child_match=re.fullmatch(r"/api/schools/child/[0-9a-fA-F-]{36}/",path)
        if verified_input is not None or album_match or child_match:
            try:data=json.loads(response.content)
            except (ValueError,AttributeError):return response
            if verified_input is not None:
                if data.get("valid") is True and data.get("album_id")==verified_input["album_id"]:
                    response.set_signed_cookie("ave_album_"+data["album_id"],data["album_id"],salt=ALBUM_SALT,max_age=TTL,
                                               secure=True,httponly=True,samesite="Lax",path="/api/albums/")
            else:
                field="images" if album_match else "photos"
                for photo in data.get(field,[]):
                    for name in ("image","web","thumb"):
                        if photo.get(name):photo[name]=signed_url(photo[name])
                response.content=json.dumps(data,ensure_ascii=False).encode();response["Content-Length"]=str(len(response.content))
            return private_headers(response)
        return response

