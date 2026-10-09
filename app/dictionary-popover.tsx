"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  buildDictionaryEntrySrcDoc,
} from "./lib/dictionary-runtime";
import { lookupUserDictionaryLemma } from "./lib/user-dictionaries";
import styles from "./dictionary-popover.module.css";

export type DictionaryPopoverState = {
  language: "ancient-greek" | "latin" | "classical-chinese";
  lemma: string;
  surface: string;
  x: number;
  y: number;
  tokenId: string;
};

export type DictionaryPopoverProps = {
  openState: DictionaryPopoverState | null;
  triggerElement?: HTMLElement | null;
  onClose: () => void;
};

type LookupResult = Awaited<ReturnType<typeof lookupUserDictionaryLemma>>;
type LoadState =
  | { status: "idle" | "loading" }
  | { status: "found"; result: NonNullable<LookupResult> }
  | { status: "not-found" }
  | { status: "error"; message: string };
type SettledLoadState = Exclude<LoadState, { status: "idle" | "loading" }> & {
  requestKey: string;
};

const DISMISS_DELAY_MS = 220;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getPosition(x: number, y: number, viewportWidth: number, viewportHeight: number) {
  const edge = 12;
  const pointerGap = 12;
  const width = Math.min(680, Math.max(120, viewportWidth - edge * 2));
  const height = Math.min(
    600,
    Math.max(180, viewportHeight * 0.62),
    Math.max(120, viewportHeight - edge * 2),
  );

  const preferredLeft = x + pointerGap;
  const left = clamp(
    preferredLeft + width <= viewportWidth - edge
      ? preferredLeft
      : x - width - pointerGap,
    edge,
    viewportWidth - width - edge,
  );
  const preferredTop = y + pointerGap;
  const top = clamp(
    preferredTop + height <= viewportHeight - edge
      ? preferredTop
      : y - height - pointerGap,
    edge,
    viewportHeight - height - edge,
  );

  return { left, top, width, height };
}

function inferredDictionaryName(language: DictionaryPopoverState["language"]) {
  return language === "classical-chinese"
    ? "Imported Classical Chinese dictionary"
    : language === "latin"
      ? "Imported Latin dictionary"
      : "Imported Ancient Greek dictionary";
}

function matchLabel(matchKind: string) {
  if (matchKind === "exact") return "Exact lemma";
  if (matchKind === "folded" || matchKind === "normalized") {
    return "Normalized match";
  }
  return matchKind.replace(/[-_]/g, " ");
}

export function DictionaryPopover({
  openState,
  triggerElement = null,
  onClose,
}: DictionaryPopoverProps) {
  const [settledLoadState, setSettledLoadState] =
    useState<SettledLoadState | null>(null);
  const [retryNumber, setRetryNumber] = useState(0);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);

  const requestKey = openState
    ? `${openState.tokenId}\u0000${openState.language}\u0000${openState.lemma}\u0000${openState.surface}\u0000${retryNumber}`
    : null;
  const loadState: LoadState = !openState
    ? { status: "idle" }
    : settledLoadState?.requestKey === requestKey
      ? settledLoadState
      : { status: "loading" };

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(
    (delay = DISMISS_DELAY_MS) => {
      if (selectingRef.current) return;
      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        onClose();
      }, delay);
    },
    [clearDismissTimer, onClose],
  );

  useEffect(() => {
    if (!openState) return;

    const updateViewport = () => {
      const visualViewport = window.visualViewport;
      setViewport({
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, [openState]);

  useEffect(() => {
    if (!openState || !requestKey) return;

    let cancelled = false;
    const query = openState.lemma.trim() || openState.surface.trim();

    void lookupUserDictionaryLemma(openState.language, query)
      .then((result) => {
        if (cancelled) return;
        if (!result || result.entries.length === 0) {
          setSettledLoadState({ requestKey, status: "not-found" });
          return;
        }
        setSettledLoadState({ requestKey, status: "found", result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSettledLoadState({
          requestKey,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The local dictionary could not be opened.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [openState, requestKey]);

  useEffect(() => {
    if (!openState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        popoverRef.current?.contains(target) ||
        triggerElement?.contains(target)
      ) {
        clearDismissTimer();
        return;
      }
      scheduleClose();
    };

    const handlePointerUp = () => {
      if (!selectingRef.current) return;
      selectingRef.current = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearDismissTimer();
        onClose();
      }
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      clearDismissTimer();
      selectingRef.current = false;
    };
  }, [clearDismissTimer, onClose, openState, scheduleClose, triggerElement]);

  const handleFrameLoad = useCallback(() => {
    const documentInsideFrame = frameRef.current?.contentDocument;
    if (!documentInsideFrame) return;

    const startSelecting = () => {
      selectingRef.current = true;
      clearDismissTimer();
    };
    const stopSelecting = () => {
      selectingRef.current = false;
    };
    const remainOpen = () => clearDismissTimer();
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    documentInsideFrame.addEventListener("pointerdown", startSelecting, true);
    documentInsideFrame.addEventListener("pointerup", stopSelecting, true);
    documentInsideFrame.addEventListener("pointermove", remainOpen, true);
    documentInsideFrame.addEventListener("keydown", closeFromKeyboard, true);
  }, [clearDismissTimer, onClose]);

  const position = useMemo(
    () =>
      openState
        ? getPosition(openState.x, openState.y, viewport.width, viewport.height)
        : null,
    [openState, viewport],
  );

  const srcDoc = useMemo(
    () =>
      settledLoadState?.requestKey === requestKey &&
      settledLoadState.status === "found"
        ? buildDictionaryEntrySrcDoc(settledLoadState.result)
        : undefined,
    [requestKey, settledLoadState],
  );

  if (!openState || !position || typeof document === "undefined") return null;

  const query = openState.lemma.trim() || openState.surface.trim();
  const foundResult = loadState.status === "found" ? loadState.result : null;
  const dictionaryName =
    foundResult?.dictionaryTitle ?? inferredDictionaryName(openState.language);
  const surfaceDiffers =
    openState.surface.trim() && openState.surface.trim() !== query;
  const inlineStyle: CSSProperties = {
    left: position.left,
    top: position.top,
    width: position.width,
    height: position.height,
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    selectingRef.current = true;
    clearDismissTimer();
  };

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      data-language={openState.language}
      role="dialog"
      aria-modal={false}
      aria-labelledby="stoa-dictionary-popover-title"
      aria-describedby="stoa-dictionary-popover-status"
      style={inlineStyle}
      onPointerEnter={clearDismissTimer}
      onPointerLeave={() => scheduleClose()}
      onPointerDown={handlePointerDown}
      onPointerUp={() => {
        selectingRef.current = false;
      }}
    >
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <p className={styles.dictionaryName}>{dictionaryName}</p>
          <div className={styles.lemmaRow}>
            <h2 id="stoa-dictionary-popover-title" className={styles.lemma}>
              {query || "Dictionary lookup"}
            </h2>
            {surfaceDiffers ? (
              <span className={styles.surface}>from {openState.surface}</span>
            ) : null}
          </div>
          <div id="stoa-dictionary-popover-status" className={styles.metaRow}>
            {foundResult ? (
              <>
                <span className={styles.matchBadge}>
                  {matchLabel(foundResult.matchKind)}
                </span>
                <span>
                  {foundResult.totalMatches === 1
                    ? "1 entry"
                    : `${foundResult.totalMatches} entries`}
                </span>
              </>
            ) : loadState.status === "loading" ? (
              <span>Searching the local dictionary…</span>
            ) : loadState.status === "not-found" ? (
              <span>No matching lemma</span>
            ) : loadState.status === "error" ? (
              <span>Dictionary unavailable</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close dictionary"
          title="Close (Esc)"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.content}>
        {loadState.status === "found" && srcDoc ? (
          <iframe
            ref={frameRef}
            className={styles.entryFrame}
            title={`${dictionaryName}: ${query}`}
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
            onLoad={handleFrameLoad}
          />
        ) : loadState.status === "loading" ? (
          <div className={styles.message} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.messageBody}>Loading the lemma entry…</p>
          </div>
        ) : loadState.status === "not-found" ? (
          <div className={styles.message} role="status">
            <p className={styles.messageTitle}>Lemma not found</p>
            <p className={styles.messageBody}>
              No entry matched “{query}”. Check the token&apos;s lemma in the word
              editor, then right-click the token again.
            </p>
          </div>
        ) : loadState.status === "error" ? (
          <div className={styles.message} role="alert">
            <p className={styles.messageTitle}>Dictionary unavailable</p>
            <p className={styles.messageBody}>{loadState.message}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => setRetryNumber((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default DictionaryPopover;
