"""Error codes with English messages (design.md D5, TASK-API-008)."""

import re
import string

import pytest
from fastapi.testclient import TestClient

from mmy_backend.config import Settings
from mmy_backend.errors import ERRORS, ErrorCode, api_error, error_message
from mmy_backend.main import create_app

CODE = re.compile(r"^(auth|media|project|export)(\.[a-z][A-Za-z]*)+$")


@pytest.mark.parametrize("code", sorted(ERRORS))
def test_code_is_dotted_and_message_uses_only_declared_params(code: ErrorCode) -> None:
    assert CODE.fullmatch(code), code
    spec = ERRORS[code]
    used = {name for _, name, _, _ in string.Formatter().parse(spec.template) if name}
    assert used <= set(spec.params), (code, used)
    message = error_message(code, dict.fromkeys(spec.params, 1))
    assert message.isascii() or "“" in message  # English, typographic quotes allowed
    assert message.strip() and "{" not in message


def test_error_code_enum_matches_errors() -> None:
    assert set(ERRORS) == set(ErrorCode)
    assert all(isinstance(code, ErrorCode) for code in ERRORS)
    assert ErrorCode.EXPORT_EMPTY_PROJECT.value == "export.emptyProject"


def test_api_error_shape() -> None:
    error = api_error("media.tooManyFiles", max=50, count=51)
    assert error.model_dump() == {
        "code": "media.tooManyFiles",
        "params": {"max": 50, "count": 51},
        "message": "Too many files: at most 50 per import (51 sent).",
    }
    assert error_message("project.slideDuration.offGrid", {"step": 0.25, "value": 2.0}) == (
        "The slide duration must be a multiple of 0.25 s (is 2 s)."
    )


def test_openapi_documents_api_error(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        spec = client.get("/openapi.json").json()
    schemas = spec["components"]["schemas"]
    assert set(schemas["ApiError"]["required"]) == {"code", "params", "message"}
    assert "issues" in schemas["ApiErrorWithIssues"]["properties"]

    # design.md D4: the codes are an enum of the contract.
    enum = schemas["ErrorCode"]
    assert enum["type"] == "string"
    assert enum["enum"] == [code.value for code in ErrorCode]
    code_ref = {"$ref": "#/components/schemas/ErrorCode"}
    assert schemas["ApiError"]["properties"]["code"]["$ref"] == code_ref["$ref"]

    # design.md D3: upload results and export jobs report errors in the same fields.
    job = schemas["ExportJob"]["properties"]
    failure = schemas["MediaUploadFailure"]["properties"]
    for name in ("ExportJob", "MediaUploadFailure"):
        fields = {"errorCode", "errorParams", "message"}
        assert fields <= set(schemas[name]["properties"]), name
        assert fields <= set(schemas[name]["required"]), name
        assert "error" not in schemas[name]["properties"], name
    assert code_ref in job["errorCode"]["anyOf"]
    assert {"type": "null"} in job["errorCode"]["anyOf"]
    assert failure["errorCode"]["$ref"] == code_ref["$ref"]

    def ref(path: str, method: str, status: str) -> str:
        content = spec["paths"][path][method]["responses"][status]["content"]
        return str(content["application/json"]["schema"]["$ref"]).rsplit("/", 1)[-1]

    assert ref("/api/media/{media_id}", "delete", "404") == "ApiErrorResponse"
    assert ref("/api/media", "post", "413") == "ApiErrorResponse"
    assert ref("/api/project", "put", "422") == "ProjectValidationResponse"
    assert ref("/api/exports", "post", "409") == "ApiErrorResponse"
    assert ref("/api/exports", "post", "422") == "ApiValidationResponse"
    assert ref("/api/exports/{export_id}", "get", "404") == "ApiErrorResponse"
    assert ref("/api/exports/{export_id}/file", "get", "409") == "ApiErrorResponse"
