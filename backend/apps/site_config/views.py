from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SiteConfig
from .serializers import SiteConfigSerializer


class SiteConfigView(APIView):
    def get(self, request):
        config = SiteConfig.get_solo()
        return Response(SiteConfigSerializer(config, context={"request": request}).data)
