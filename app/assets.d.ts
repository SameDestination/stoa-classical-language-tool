declare module "pdfkit/js/pdfkit.standalone.js" {
  import PDFDocument from "pdfkit";
  export default PDFDocument;
}

declare module "*?worker&inline" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module "mdict-js/lib/mdict-base.js" {
  const MdictBase: unknown;
  export default MdictBase;
}
