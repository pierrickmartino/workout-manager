"""FastAPI application factory and wiring."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.envelope import error_envelope
from app.routes.profile import router as profile_router

HTTP_UNPROCESSABLE_ENTITY = 422


def create_app() -> FastAPI:
    app = FastAPI(title="Workout Manager API", version="0.1.0")

    @app.exception_handler(HTTPException)
    async def _envelope_http_errors(_: Request, exc: HTTPException) -> JSONResponse:
        # Keep error responses in the same envelope as successful ones.
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(str(exc.detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def _envelope_validation_errors(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Surface validation failures in the same envelope, without leaking the
        # full internal error structure to the client.
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(str(part) for part in first.get("loc", []))
        message = first.get("msg", "Invalid request")
        detail = f"{location}: {message}" if location else message
        return JSONResponse(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            content=error_envelope(detail),
        )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(profile_router)
    return app


app = create_app()
