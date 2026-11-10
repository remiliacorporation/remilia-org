import { useEffect, useState, type ReactNode } from "react";
import { usePresentationParams, type PreviewHeaderProps } from "sanity/presentation";

const FULL = "remilia.presentation.full";
const DOCKED = "remilia.presentation.docked";

function stored(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function store(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Private windows may refuse storage; the toggle still works this session.
  }
}

/**
 * Presentation's preview header plus three layout toggles. Full window hides
 * the Studio bar so the site fills the browser; the editor floats over the
 * page instead of taking a column, and can be hidden while browsing. Clicking
 * an edit target on the page brings a hidden editor back.
 */
export function PresentationHeader(props: PreviewHeaderProps): ReactNode {
  const [full, setFull] = useState(() => stored(FULL));
  const [docked, setDocked] = useState(() => stored(DOCKED));
  const [hidden, setHidden] = useState(false);
  const params = usePresentationParams(false);
  const focus = `${params?.id ?? ""}:${params?.path ?? ""}`;

  useEffect(() => {
    if (params?.path) setHidden(false);
  }, [focus]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("rve-full", full);
    root.classList.toggle("rve-float", !docked);
    root.classList.toggle("rve-editor-hidden", !docked && hidden);
    return () => {
      root.classList.remove("rve-full", "rve-float", "rve-editor-hidden");
    };
  }, [full, docked, hidden]);

  return (
    <>
      {props.renderDefault(props)}
      <div className="rve-tools" role="group" aria-label="Layout">
        {docked ? null : (
          <button
            type="button"
            className="rve-tool"
            aria-pressed={!hidden}
            onClick={() => setHidden((h) => !h)}
          >
            {hidden ? "Show editor" : "Hide editor"}
          </button>
        )}
        <button
          type="button"
          className="rve-tool"
          aria-pressed={!docked}
          onClick={() => {
            setDocked((d) => {
              store(DOCKED, !d);
              return !d;
            });
            setHidden(false);
          }}
        >
          {docked ? "Float editor" : "Dock editor"}
        </button>
        <button
          type="button"
          className="rve-tool"
          aria-pressed={full}
          onClick={() =>
            setFull((f) => {
              store(FULL, !f);
              return !f;
            })
          }
        >
          {full ? "Exit full window" : "Full window"}
        </button>
      </div>
    </>
  );
}
