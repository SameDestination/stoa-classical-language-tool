/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "../legal.module.css";

export default function PrivacyPage() {
  return (
    <main className={styles.legalPage}>
      <nav><a href="/"><span>Σ</span> STOA</a><a href="/trial">Open Web Trial</a></nav>
      <article>
        <p className={styles.eyebrow}>PRIVACY</p>
        <h1>Your texts should remain yours.</h1>
        <p className={styles.updated}>Draft for the STOA preview website · 24 August 2026</p>
        <section><h2>Local working data</h2><p>The STOA Web Trial stores its working document and preferences in your browser. STOA does not require an account for the trial and does not intentionally transmit your source text, annotations, translations, or project files to a STOA server.</p></section>
        <section><h2>AI services</h2><p>The Web Trial uses a manual prompt workflow. If you copy a prompt to an external AI provider, your use of that service is governed by the provider’s own privacy terms. STOA does not send the prompt on your behalf.</p></section>
        <section><h2>Files and browser storage</h2><p>Imported files are processed in your browser. Clearing browser data may remove the local working copy, so export a STOA Project before changing browsers or devices.</p></section>
        <section><h2>Before public launch</h2><p>This is a preview policy and will be replaced by the final legal policy before STOA accepts payments or collects customer information.</p></section>
      </article>
    </main>
  );
}
