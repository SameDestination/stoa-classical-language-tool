/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "./trial.module.css";

export default function TrialPage() {
  return (
    <main className={styles.trialShell}>
      <header className={styles.trialBar}>
        <a className={styles.brand} href="/" aria-label="Return to STOA home">
          <span>Σ</span> STOA
        </a>
        <div className={styles.trialIdentity}>
          <b>WEB TRIAL</b>
          <span>Greek &amp; Latin · STOA 3.5</span>
        </div>
        <a className={styles.desktopCta} href="/#early-access">Get the desktop edition</a>
      </header>
      <div className={styles.frameWrap}>
        <iframe
          className={styles.frame}
          src="/trial-app/STOA-Interlinear-Studio-3.5.html"
          title="STOA 3.5 Web Trial"
          allow="clipboard-read; clipboard-write"
        />
        <div className={styles.watermark} aria-hidden="true">
          <span>STOA WEB TRIAL</span>
        </div>
      </div>
    </main>
  );
}
