"""GET /api/catalog/transitions and /api/catalog/titles - validated at startup."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.title_catalog import TitleCatalog

router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_catalog(request: Request) -> TransitionCatalog:
    return cast(TransitionCatalog, request.app.state.catalog)


def get_title_catalog(request: Request) -> TitleCatalog:
    return cast(TitleCatalog, request.app.state.title_catalog)


@router.get("/transitions")
def list_transitions(
    catalog: Annotated[TransitionCatalog, Depends(get_catalog)],
) -> TransitionCatalog:
    return catalog


@router.get("/titles")
def list_titles(
    catalog: Annotated[TitleCatalog, Depends(get_title_catalog)],
) -> TitleCatalog:
    return catalog
