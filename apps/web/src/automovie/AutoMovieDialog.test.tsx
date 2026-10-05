import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ImageSlide, MusicClip, Slide, Transition, VideoSlide } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import { audioItem, CATALOG, mediaItem, mockApi, videoItem } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const MENU = "AutoMovie…";

function clip(mediaId: string): MusicClip {
  return {
    id: `c-${mediaId}`,
    mediaId,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  };
}

/** Three pictures, one video clip and one audio file, in that import order. */
const collection = () => [
  mediaItem("a"),
  mediaItem("b"),
  videoItem("v", 7.5),
  mediaItem("c"),
  audioItem("song", 60),
];

/** The shared mock catalog plus "Auflösen", which the old-movie style uses. */
const DISSOLVE: Transition = {
  id: "dissolve",
  names: { de: "Auflösen", en: "Dissolve" },
  shader: "dissolve.glsl",
  defaultDuration: 2,
  params: {},
  source: { kind: "wmm2x-xml", ref: "x" },
};

function withCollection() {
  return renderApp(
    mockApi({
      listMedia: async () => collection(),
      catalog: async () => [...CATALOG, DISSOLVE],
    }),
  );
}

/** The filmstrip narrowed to the picture and video elements between the titles. */
function mediaSlides(slides: readonly Slide[]): (ImageSlide | VideoSlide)[] {
  return slides.filter((slide): slide is ImageSlide | VideoSlide => slide.kind !== "title");
}

/** The texts of the title elements AutoMovie framed the movie with. */
function titleTexts(slides: readonly Slide[]): (string[] | null)[] {
  return slides.filter((slide) => slide.kind === "title").map((slide) => slide.lines);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("menuitem", { name: "Extras" }));
  await user.click(screen.getByRole("menuitem", { name: MENU }));
}

async function create(user: ReturnType<typeof userEvent.setup>, style: string, title = "Urlaub") {
  await openDialog(user);
  // An empty film title is left untyped - the field starts empty.
  if (title !== "") await user.type(screen.getByLabelText("Filmtitel:"), title);
  await user.click(screen.getByRole("radio", { name: new RegExp(style) }));
  await user.click(screen.getByRole("button", { name: "Erstellen" }));
}

describe("Extras → AutoMovie…", () => {
  it("is disabled while the collection holds no picture and no video", async () => {
    const user = userEvent.setup();
    const { ready } = renderApp(mockApi({ listMedia: async () => [audioItem("song")] }));
    await ready;
    await user.click(screen.getByRole("menuitem", { name: "Extras" }));
    expect(screen.getByRole("menuitem", { name: MENU })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the dialog with the film title field and the three styles", async () => {
    const user = userEvent.setup();
    const { ready } = withCollection();
    await ready;
    await openDialog(user);
    expect(screen.getByLabelText("Filmtitel:")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Klassisch/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Alter Film/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Musikvideo/ })).toBeInTheDocument();
  });

  it("disables the style that needs music while there is none", async () => {
    const user = userEvent.setup();
    const { ready } = withCollection();
    await ready;
    await openDialog(user);
    expect(screen.getByRole("radio", { name: /Musikvideo/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Klassisch/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Alter Film/ })).toBeEnabled();
  });

  it("offers the style that needs music once the project has a music track", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.setState({ music: [clip("song")] });
    await openDialog(user);
    expect(screen.getByRole("radio", { name: /Musikvideo/ })).toBeEnabled();
  });

  it("builds the classic style from the whole collection in import order", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Klassisch");
    const { slides } = store.getState();
    expect(mediaSlides(slides).map((slide) => slide.mediaId)).toEqual(["a", "b", "v", "c"]);
    expect(slides.map((slide) => slide.kind)).toEqual([
      "title",
      "image",
      "image",
      "video",
      "image",
      "title",
    ]);
    // "Überblenden" between all neighbours; only the opening title has none.
    expect(slides[0]?.transitionIn).toBeNull();
    expect(slides.slice(1).map((slide) => slide.transitionIn?.transitionId)).toEqual([
      "fade",
      "fade",
      "fade",
      "fade",
      "fade",
    ]);
    expect(mediaSlides(slides).every((slide) => slide.effectId === null)).toBe(true);
  });

  it("frames the movie with the film title and the closing title", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Klassisch");
    const { slides } = store.getState();
    expect(titleTexts(slides)).toEqual([["Urlaub"], ["Ende"]]);
    expect(slides[0]?.kind).toBe("title");
    expect(slides.at(-1)?.kind).toBe("title");
    // Both in the style's own title style (automovie.json `titleStyleId`).
    const titles = slides.filter((slide) => slide.kind === "title");
    expect(titles.map((slide) => slide.styleId)).toEqual(["basic-title", "basic-title"]);
  });

  it("uses the title style of the chosen style", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.setState({ music: [clip("song")] });
    await create(user, "Musikvideo");
    const titles = store.getState().slides.filter((slide) => slide.kind === "title");
    expect(titles.map((slide) => slide.styleId)).toEqual(["zoom-in", "zoom-in"]);
  });

  it("writes the closing title in the UI language", async () => {
    const { store, ready } = withCollection();
    await ready;
    store.setState({ locale: "en" });
    expect(store.getState().autoMovie("classic", "Holiday")).toBe(true);
    expect(titleTexts(store.getState().slides)).toEqual([["Holiday"], ["The End"]]);
  });

  it("opens straight on the first picture when no film title was entered", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Klassisch", "");
    const { slides } = store.getState();
    expect(titleTexts(slides)).toEqual([["Ende"]]);
    expect(slides[0]?.kind).toBe("image");
    expect(slides[0]?.transitionIn).toBeNull();
  });

  it("leaves the media collection untouched", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Klassisch");
    expect(store.getState().media.map((item) => item.id)).toEqual(["a", "b", "v", "c", "song"]);
  });

  it("puts the old-movie effect on every picture and video clip", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Alter Film");
    const { slides } = store.getState();
    expect(mediaSlides(slides).map((slide) => slide.effectId)).toEqual([
      "film-age-older",
      "film-age-older",
      "film-age-older",
      "film-age-older",
    ]);
    expect(slides.slice(1).map((slide) => slide.transitionIn)).toEqual([
      { transitionId: "dissolve", duration: 2 },
      { transitionId: "dissolve", duration: 2 },
      { transitionId: "dissolve", duration: 2 },
      { transitionId: "dissolve", duration: 2 },
      { transitionId: "dissolve", duration: 2 },
    ]);
  });

  it("fits the music video to the length of the music", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp(
      mockApi({ listMedia: async () => [mediaItem("a"), mediaItem("b"), audioItem("song", 60)] }),
    );
    await ready;
    store.setState({ music: [clip("song")] });
    await create(user, "Musikvideo");
    const { slides } = store.getState();
    expect(slides.slice(1).map((slide) => slide.transitionIn?.transitionId)).toEqual([
      "circle",
      "circle",
      "circle",
    ]);
    // 60 s of music; the transitions overlap, so the movie duration comes
    // from the time model, not from the sum of the element durations. The two
    // title elements have a display duration like a picture, so the fit
    // stretches them along with the pictures (design.md D2 step 5).
    expect(timelineOf(slides).duration).toBeCloseTo(60, 1);
  });

  it("gets as close to the music as the fixed video clips allow", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.setState({ music: [clip("song")] });
    await create(user, "Musikvideo");
    const { slides } = store.getState();
    expect(slides.slice(1).map((slide) => slide.transitionIn?.transitionId)).toEqual([
      "circle",
      "circle",
      "circle",
      "circle",
      "circle",
    ]);
    // "Fit movie to music" only resizes pictures and titles - a video clip's
    // length is its trim (add-timeline-editing non-goal). With one 7.5 s clip
    // among three pictures and two titles the movie therefore lands near, not
    // exactly on, the 60 s of music; the rest carries the whole adjustment.
    expect(timelineOf(slides).duration).toBeGreaterThan(40);
    expect(timelineOf(slides).duration).toBeLessThan(60);
    const pictures = slides.filter((slide) => slide.kind === "image");
    expect(pictures.every((slide) => slide.kind === "image" && slide.duration > 5)).toBe(true);
  });

  it("asks before replacing a filmstrip that is not empty", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.getState().addSlide("a");
    const before = store.getState().slides;

    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: /Klassisch/ }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(/ersetzt den gesamten Bildstreifen/);
    expect(store.getState().slides).toEqual(before);

    await user.click(screen.getByRole("button", { name: "Ja" }));
    expect(mediaSlides(store.getState().slides).map((slide) => slide.mediaId)).toEqual([
      "a",
      "b",
      "v",
      "c",
    ]);
  });

  it("keeps the filmstrip when the question is declined", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.getState().addSlide("a");
    const before = store.getState().slides;

    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: /Klassisch/ }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));
    await user.click(screen.getByRole("button", { name: "Nein" }));

    expect(store.getState().slides).toEqual(before);
  });

  it("asks nothing while the filmstrip is empty", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    await create(user, "Klassisch");
    // Four media elements between the film title and "Ende".
    expect(store.getState().slides).toHaveLength(6);
  });

  it("undoes the whole AutoMovie in one step", async () => {
    const user = userEvent.setup();
    const { store, ready } = withCollection();
    await ready;
    store.setState({ music: [clip("song")] });
    store.getState().addSlide("a");
    const before = store.getState().slides;

    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: /Musikvideo/ }));
    await user.click(screen.getByRole("button", { name: "Erstellen" }));
    await user.click(screen.getByRole("button", { name: "Ja" }));
    // No film title was typed, so only the closing title joins the four media.
    expect(store.getState().slides).toHaveLength(5);

    store.getState().undo();
    expect(store.getState().slides).toEqual(before);
  });
});
