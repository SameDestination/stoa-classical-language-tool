import styles from "./marketing.module.css";

const downloadUrl = "https://github.com/SameDestination/stoa-classical-language-tool/releases/latest";

const sampleTokens = [
  { source: "ἡ", gloss: "the", note: "Nom. Sg. f." },
  { source: "ψυχὴ", gloss: "soul", note: "Nom. Sg." },
  { source: "ἰσχυρὰ", gloss: "strong", note: "Nom. Sg. f." },
  { source: "τὰ", gloss: "the", note: "Acc. Pl. n." },
  { source: "καλὰ", gloss: "beautiful things", note: "Acc. Pl." },
  { source: "φιλεῖ.", gloss: "loves", note: "3rd Sg. Pres. Act." },
];

export default function MarketingHome() {
  return (
    <main className={styles.siteShell}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="#top" aria-label="STOA home">
          <span className={styles.brandMark}>Σ</span>
          <span>STOA</span>
        </a>
        <div className={styles.navLinks}>
          <a href="#languages">Languages</a>
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
        </div>
        <a className={styles.navCta} href={downloadUrl}>Download STOA</a>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>INTERLINEAR READING · SCHOLARLY TYPESETTING</p>
          <h1>Read closely.<br />Understand deeply.<br /><em>Typeset beautifully.</em></h1>
          <p className={styles.heroText}>
            STOA is a local-first studio for building, editing, and publishing
            interlinear readings in Ancient Greek, Latin, and Classical Chinese.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href={downloadUrl}>Download STOA</a>
            <a className={styles.secondaryCta} href="#early-access">Explore the studio <span>↓</span></a>
          </div>
          <p className={styles.privacyNote}>
            <span aria-hidden="true">●</span> Your text stays on your computer.
            No account required.
          </p>
        </div>

        <div className={styles.heroVisual} aria-label="Ancient Greek interlinear sample">
          <div className={styles.paperShadow} />
          <article className={styles.paper}>
            <header className={styles.paperHeader}>
              <div>
                <span>STOA</span>
                <small>INTERLINEAR STUDIO</small>
              </div>
              <p>ANCIENT GREEK · READING I</p>
            </header>
            <div className={styles.paperRule} />
            <div className={styles.tokenGrid}>
              {sampleTokens.map((token) => (
                <div className={styles.token} key={token.source}>
                  <strong>{token.source}</strong>
                  <span>{token.gloss}</span>
                  <small>{token.note}</small>
                </div>
              ))}
            </div>
            <blockquote>
              “The strong soul loves beautiful things.”
            </blockquote>
            <footer>
              <span>SEARCHABLE VECTOR TYPE</span>
              <span>01</span>
            </footer>
          </article>
          <div className={styles.annotationCard}>
            <span>SELECTED TOKEN</span>
            <b>ψυχὴ</b>
            <p>Lemma <strong>ψυχή</strong></p>
            <p>Morphology <strong>Nom. Sg. f.</strong></p>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="STOA capabilities">
        <span>ANCIENT GREEK</span>
        <i>·</i>
        <span>LATIN</span>
        <i>·</i>
        <span>CLASSICAL CHINESE</span>
        <i>·</i>
        <span>PDF</span>
        <i>·</i>
        <span>PNG</span>
        <i>·</i>
        <span>LATEX</span>
      </section>

      <section className={styles.section} id="languages">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>BUILT FOR CLOSE READING</p>
            <h2>Three classical traditions.<br />One disciplined workspace.</h2>
          </div>
          <p>
            Keep source text, translation, lemma, part of speech, and morphology
            together as a single editable token—through every line break and page.
          </p>
        </div>

        <div className={styles.languageGrid}>
          <article className={styles.languageCard}>
            <span className={styles.cardNumber}>01</span>
            <p className={styles.languageScript}>ἄνθρωπος</p>
            <h3>Ancient Greek</h3>
            <p>Polytonic typography, token-level morphology, lemma editing, and an interlinear page designed for close grammatical reading.</p>
            <small>GREEK → ENGLISH</small>
          </article>
          <article className={styles.languageCard}>
            <span className={styles.cardNumber}>02</span>
            <p className={styles.languageScript}>sapientia</p>
            <h3>Latin</h3>
            <p>Clear inflectional annotation, flexible scholarly abbreviations, and restrained typography for prose, verse, and teaching texts.</p>
            <small>LATIN → ENGLISH</small>
          </article>
          <article className={`${styles.languageCard} ${styles.chineseCard}`}>
            <span className={styles.cardNumber}>03</span>
            <p className={styles.languageScript}>學而時習之</p>
            <h3>Classical Chinese</h3>
            <p>Purpose-built annotation layers and six bundled Chinese typefaces for philological reading and publication-ready composition.</p>
            <small>CLASSICAL CHINESE → ENGLISH</small>
          </article>
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.workflowIntro}>
          <p className={styles.sectionEyebrow}>FROM TEXT TO READING EDITION</p>
          <h2>A scholarly workflow,<br /><em>without the typesetting friction.</em></h2>
          <p>
            STOA does not hide the linguistic structure behind a black box.
            Every result remains visible, editable, and portable.
          </p>
          <a href={downloadUrl}>Download the studio <span>↗</span></a>
        </div>
        <ol className={styles.workflowList}>
          <li>
            <span>01</span>
            <div><b>Bring your text</b><p>Paste source text or import a complete STOA project.</p></div>
          </li>
          <li>
            <span>02</span>
            <div><b>Add linguistic analysis</b><p>Use the guided AI prompt workflow, then import structured JSON.</p></div>
          </li>
          <li>
            <span>03</span>
            <div><b>Edit every token</b><p>Correct the surface form, punctuation, gloss, lemma, and morphology.</p></div>
          </li>
          <li>
            <span>04</span>
            <div><b>Compose the page</b><p>Control typography, spacing, paper, color, breaks, and translations.</p></div>
          </li>
          <li>
            <span>05</span>
            <div><b>Publish or continue elsewhere</b><p>Export PDF, PNG, LaTeX, or a portable STOA project.</p></div>
          </li>
        </ol>
      </section>

      <section className={styles.featureSection} id="features">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>THE STUDIO</p>
            <h2>Editorial control at<br />the level of the word.</h2>
          </div>
          <p>
            Designed for students, teachers, independent readers, and scholars
            who need more than a translation box.
          </p>
        </div>
        <div className={styles.featureGrid}>
          <article><span>Aa</span><h3>Five-layer token editor</h3><p>Edit source, gloss, lemma, part of speech, and morphology without breaking the interlinear unit.</p></article>
          <article><span>¶</span><h3>Intentional page flow</h3><p>Add line breaks, paragraph breaks, and precise blank space while keeping pagination stable.</p></article>
          <article><span>↔</span><h3>Adaptive composition</h3><p>Balance type size, word spacing, and line rhythm against the selected paper format.</p></article>
          <article><span>Σ</span><h3>Local lexicon lookup</h3><p>Open classical-language entries beside the selected token without interrupting the reading page.</p></article>
          <article><span>PDF</span><h3>Scholarly export</h3><p>Create searchable vector PDF in the desktop edition, plus PDF-derived PNG and LaTeX output.</p></article>
          <article><span>{`{ }`}</span><h3>Portable projects</h3><p>Move tokens, styles, fonts, paper settings, breaks, and translation layers between devices.</p></article>
        </div>
      </section>

      <section className={styles.localSection}>
        <div className={styles.localStatement}>
          <p className={styles.sectionEyebrow}>LOCAL-FIRST BY DESIGN</p>
          <h2>Your text is a text,<br /><em>not a data source.</em></h2>
        </div>
        <div className={styles.localDetails}>
          <p>
            STOA keeps your working document on your own computer. It does not
            require an account and does not upload your classical text to a
            STOA server.
          </p>
          <div>
            <span>01 <b>Device-local working state</b></span>
            <span>02 <b>Portable project files</b></span>
            <span>03 <b>Your choice of AI model</b></span>
          </div>
        </div>
      </section>

      <section className={styles.compareSection} id="early-access">
        <div className={styles.compareCopy}>
          <p className={styles.sectionEyebrow}>DOWNLOAD STOA</p>
          <h2>Explore the method.<br />Keep the finished work.</h2>
          <p>
            STOA is free software. Install the desktop edition for macOS or
            Windows, or run the Portable edition from a folder without
            installing anything.
          </p>
          <a className={styles.primaryCta} href={downloadUrl}>Download STOA</a>
        </div>
        <div className={styles.compareTable}>
          <div className={styles.compareHead}><span>CAPABILITY</span><b>PORTABLE</b><b>DESKTOP</b></div>
          <div><span>Token-level editing</span><b>Included</b><b>Included</b></div>
          <div><span>Page composition</span><b>Included</b><b>Included</b></div>
          <div><span>PDF, PNG &amp; LaTeX export</span><b>Included</b><b>Included</b></div>
          <div><span>Offline operation</span><b>Included</b><b>Included</b></div>
          <div><span>Native Open &amp; Save</span><b>—</b><b>Included</b></div>
          <div><span>Installation</span><b>Not needed</b><b>Installer</b></div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><span>Σ</span><b>STOA</b><p>Interlinear Reading &amp; Scholarly Typesetting</p></div>
        <div className={styles.footerLinks}>
          <div><b>PRODUCT</b><a href={downloadUrl}>Download</a><a href="#features">Features</a><a href="#languages">Languages</a></div>
          <div><b>INFORMATION</b><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
        </div>
        <p className={styles.copyright}>© 2026 STOA. Built for careful readers.</p>
      </footer>
    </main>
  );
}
