/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <main className={styles.legalPage}>
      <nav><a href="/"><span>Σ</span> STOA</a><a href="/trial">Open Web Trial</a></nav>
      <article>
        <p className={styles.eyebrow}>WEB TRIAL TERMS</p>
        <h1>A workspace for evaluation, not a substitute for judgment.</h1>
        <p className={styles.updated}>Draft for the STOA preview website · 24 August 2026</p>
        <section><h2>Purpose of the trial</h2><p>The Web Trial is provided for evaluation and non-commercial study. Features, supported formats, and availability may change before the commercial desktop release.</p></section>
        <section><h2>Scholarly responsibility</h2><p>AI-generated translations and grammatical analyses may contain errors. Users remain responsible for checking source text, morphology, translations, citations, and publication rights.</p></section>
        <section><h2>User content</h2><p>You retain responsibility for text and files you import. Do not use material that you are not entitled to process, reproduce, or export.</p></section>
        <section><h2>No warranty</h2><p>The preview is supplied as-is for testing. Final commercial licensing, refund, support, and update terms will be published before sales begin.</p></section>
      </article>
    </main>
  );
}
