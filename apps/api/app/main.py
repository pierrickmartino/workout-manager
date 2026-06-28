"""FastAPI application factory and wiring."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.envelope import error_envelope
from app.routes.profile import router as profile_router


def create_app() -> FastAPI:
    app = FastAPI(title="Workout Manager API", version="0.1.0")

    @app.exception_handler(HTTPException)
    async def _envelope_http_errors(_: Request, exc: HTTPException) -> JSONResponse:
        # Keep error responses in the same envelope as successful ones.
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(str(exc.detail)),
        )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(profile_router)
    return app


app = create_app()
