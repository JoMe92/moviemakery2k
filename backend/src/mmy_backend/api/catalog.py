"""GET /api/catalog/transitions - der beim Start validierte Übergangskatalog."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request

from mmy_backend.catalog import TransitionCatalog

router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_catalog(request: Request) -> TransitionCatalog:
    return cast(TransitionCatalog, request.app.state.catalog)


@router.get("/transitions")
def list_transitions(
    catalog: Annotated[TransitionCatalog, Depends(get_catalog)],
) -> TransitionCatalog:
    return catalog
