"""Access token for the LAN mode (design.md D1 of add-mobile-delivery).

With ``MMY_ACCESS_TOKEN`` set, every request under ``/api/`` needs the token,
either as the cookie ``mmy_access`` or as ``Authorization: Bearer <token>``;
otherwise the middleware answers 401 with the error code ``auth.required``.
The app shell (HTML, scripts, styles, manifest, icons, service worker) stays
reachable without a token: it contains no data.

Token exchange: a request outside ``/api/`` with the query parameter ``token``
redirects (303) to the same address without ``token``, so the token does not
stay in the browser history. A valid token also sets the cookie; an invalid
one sets none, and the app then shows "Access required".
"""

import hmac
from urllib.parse import quote, urlencode

from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from mmy_backend.errors import ErrorCode, api_error

COOKIE_NAME = "mmy_access"
COOKIE_MAX_AGE = 30 * 24 * 60 * 60
"""30 days, in seconds."""
TOKEN_PARAM = "token"


def _is_api(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def _bearer(request: Request) -> str | None:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def _is_https(request: Request) -> bool:
    # Behind `tailscale serve` the TLS ends at the proxy; it reports the scheme
    # in X-Forwarded-Proto. The flag only decides the cookie's `Secure` attribute.
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded == "https"


class AccessTokenMiddleware:
    """ASGI middleware guarding ``/api/`` with one shared access token."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        if not token:
            raise ValueError("the access token must not be empty")
        self.app = app
        self._token = token.encode()

    def _valid(self, candidate: str | None) -> bool:
        return candidate is not None and hmac.compare_digest(candidate.encode(), self._token)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if _is_api(request.url.path):
            if self._valid(request.cookies.get(COOKIE_NAME)) or self._valid(_bearer(request)):
                await self.app(scope, receive, send)
                return
            body = {"detail": api_error(ErrorCode.AUTH_REQUIRED).model_dump(mode="json")}
            await JSONResponse(body, status_code=401)(scope, receive, send)
            return
        if TOKEN_PARAM in request.query_params:
            await self._exchange(request)(scope, receive, send)
            return
        await self.app(scope, receive, send)

    def _exchange(self, request: Request) -> RedirectResponse:
        rest = [(k, v) for k, v in request.query_params.multi_items() if k != TOKEN_PARAM]
        location = quote(request.url.path) + (f"?{urlencode(rest)}" if rest else "")
        response = RedirectResponse(location, status_code=303)
        response.headers["Cache-Control"] = "no-store"
        token = request.query_params[TOKEN_PARAM]
        if self._valid(token):
            response.set_cookie(
                COOKIE_NAME,
                token,
                max_age=COOKIE_MAX_AGE,
                path="/",
                httponly=True,
                samesite="strict",
                secure=_is_https(request),
            )
        return response
