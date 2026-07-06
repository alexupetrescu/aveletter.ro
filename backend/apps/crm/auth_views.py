from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import CRM_AUTHENTICATION, IsStaff


def _user_payload(user):
    return {
        "id": user.pk,
        "username": user.get_username(),
        "name": user.get_full_name() or user.get_username(),
        "is_staff": user.is_staff,
    }


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Also sets the csrftoken cookie on the response.
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        user = authenticate(request, username=username, password=password)
        if user is None or not user.is_staff:
            return Response(
                {"errors": ["Date de autentificare invalide."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        # Login rotates the CSRF token; hand the fresh one back.
        return Response({"user": _user_payload(user), "csrfToken": get_token(request)})


class LogoutView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [IsStaff]

    def post(self, request):
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    authentication_classes = CRM_AUTHENTICATION
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        if not (user and user.is_authenticated and user.is_staff):
            return Response({"user": None})
        return Response({"user": _user_payload(user), "csrfToken": get_token(request)})
