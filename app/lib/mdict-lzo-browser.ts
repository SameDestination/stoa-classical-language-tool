import { lzo1xDecompress } from "lzo1x";

type BinaryInput = ArrayBuffer | ArrayBufferView;

const bytesFor = (input: BinaryInput) => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
};

// mdict-js expects this CommonJS-shaped wrapper and passes the decompressed
// byte length as its second argument. Keep the adapter local so the browser
// build never includes mdict-js's GPL minilzo port.
export const decompress = (
  input: BinaryInput,
  expectedOutputLength?: number,
) => lzo1xDecompress(
  bytesFor(input),
  Number.isSafeInteger(expectedOutputLength) && Number(expectedOutputLength) >= 0
    ? Number(expectedOutputLength)
    : undefined,
);

export default { decompress };
