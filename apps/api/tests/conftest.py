"""Shared test helpers: an in-memory RSA keypair, a JWKS built from it, and a
factory for signing Clerk-style RS256 JWTs. Keeps tests offline — no network
calls to a real Clerk JWKS endpoint."""

from __future__ import annotations

import time
from dataclasses import dataclass

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

ISSUER = "https://example.clerk.accounts.dev"
KID = "test-key-1"


@dataclass
class SigningContext:
    private_key: rsa.RSAPrivateKey
    jwks: dict
    issuer: str = ISSUER
    kid: str = KID

    def mint(
        self,
        *,
        sub: str = "user_123",
        issuer: str | None = None,
        kid: str | None = None,
        expires_in: int = 3600,
        extra_claims: dict | None = None,
    ) -> str:
        now = int(time.time())
        payload = {
            "sub": sub,
            "iss": issuer or self.issuer,
            "iat": now,
            "exp": now + expires_in,
        }
        if extra_claims:
            payload.update(extra_claims)
        return jwt.encode(
            payload,
            self.private_key,
            algorithm="RS256",
            headers={"kid": kid or self.kid},
        )


def _jwks_from_public_key(public_key: rsa.RSAPublicKey, kid: str) -> dict:
    numbers = public_key.public_numbers()

    def b64(value: int) -> str:
        import base64

        length = (value.bit_length() + 7) // 8
        return base64.urlsafe_b64encode(value.to_bytes(length, "big")).rstrip(b"=").decode()

    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": kid,
                "n": b64(numbers.n),
                "e": b64(numbers.e),
            }
        ]
    }


def make_signing_context() -> SigningContext:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwks = _jwks_from_public_key(private_key.public_key(), KID)
    return SigningContext(private_key=private_key, jwks=jwks)
