"""Outbound email, via Resend.

One message type exists: a password reset link. Nothing else is ever sent —
no welcome mail, no digests, no announcements — so there is no unsubscribe to
build and nothing to opt out of.

If no API key is configured the app still works; reset simply reports that it
is unavailable, and in debug the link is written to the log so local testing
needs no account anywhere.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from flask import current_app

RESEND_ENDPOINT = "https://api.resend.com/emails"
TIMEOUT_SECONDS = 10
USER_AGENT = "weekform/1.0 (+https://weekform.app)"


def is_configured() -> bool:
    return bool(current_app.config.get("RESEND_API_KEY"))


def send(to: str, subject: str, text: str) -> tuple[bool, str]:
    """Send one plain-text message.

    Returns (accepted, detail). The detail carries the provider's own words on
    failure, because "it didn't send" is not a diagnosis and guessing at the
    reason wastes an afternoon.
    """
    api_key = current_app.config.get("RESEND_API_KEY")
    sender = current_app.config.get("MAIL_FROM")

    if not api_key or not sender:
        missing = "RESEND_API_KEY" if not api_key else "MAIL_FROM"
        current_app.logger.warning("email not configured: %s is unset", missing)
        if current_app.config.get("DEBUG"):
            current_app.logger.warning("would have sent:\n%s", text)
        return False, f"{missing} is not set on this deployment"

    body = json.dumps({
        "from": sender,
        "to": [to],
        "subject": subject,
        "text": text,
    }).encode()

    request = urllib.request.Request(
        RESEND_ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Without this, urllib introduces itself as "Python-urllib/3.12".
            # Resend's API sits behind Cloudflare, whose bot rules reject that
            # signature with a 403 and error code 1010 — before the request ever
            # reaches Resend, which is why such failures leave no trace in their
            # console at all.
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            if 200 <= response.status < 300:
                current_app.logger.info("email accepted by the provider")
                return True, "accepted"
            return False, f"provider returned {response.status}"
    except urllib.error.HTTPError as err:
        # The body carries Resend's reason — an unverified sending domain or a
        # bad key, usually. A terse "error code: NNNN" is not from Resend at
        # all: it is Cloudflare refusing the request at the edge, and saying so
        # saves a long hunt through a provider console that never saw it.
        detail = err.read().decode(errors="replace")[:400]
        if "error code:" in detail and len(detail) < 120:
            detail = (f"{detail.strip()} — this is Cloudflare blocking the "
                      "request before it reaches the provider, not the "
                      "provider refusing it")
        current_app.logger.error("email rejected (%s): %s", err.code, detail)
        return False, f"{err.code}: {detail}"
    except Exception as err:
        current_app.logger.exception("could not reach the email provider")
        return False, f"could not reach the provider: {err}"


def send_reset_link(to: str, link: str) -> tuple[bool, str]:
    return send(
        to,
        "Reset your weekform password",
        "Someone asked to reset the password for this weekform account.\n\n"
        f"{link}\n\n"
        "The link works once and expires in two hours.\n"
        "If it wasn't you, ignore this — nothing has changed.\n",
    )


def sender_address() -> str:
    """What the deployment will put in the From header, for the admin page."""
    return current_app.config.get("MAIL_FROM") or "(unset)"
