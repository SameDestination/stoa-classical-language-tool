/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <main className={styles.legalPage}>
      <nav><a href="/"><span>Σ</span> STOA</a><a href="https://github.com/SameDestination/stoa-classical-language-tool/releases/latest">Download STOA</a></nav>
      <article>
        <p className={styles.eyebrow}>TERMS</p>
        <h1>A scholarly workspace, not a substitute for judgment.</h1>
        <p className={styles.updated}>Draft for the STOA preview website · 3 November 2026</p>
        <section><h2>Software license</h2><p>STOA is free software, licensed under the GNU General Public License, version 3 or (at your option) any later version. Bundled fonts and third-party components keep their own licenses.</p></section>
        <section><h2>Scholarly responsibility</h2><p>AI-generated translations and grammatical analyses may contain errors. Users remain responsible for checking source text, morphology, translations, citations, and publication rights.</p></section>
        <section><h2>User content</h2><p>You retain responsibility for text and files you import. Do not use material that you are not entitled to process, reproduce, or export.</p></section>
        <section><h2>No warranty</h2><p>STOA is provided without any warranty, as stated in the GNU General Public License.</p></section>
      </article>
    </main>
  );
}
