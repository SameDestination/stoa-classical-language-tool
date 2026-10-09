type AssertFunction = {
  (condition: unknown, message?: string | Error): asserts condition;
  ok: (condition: unknown, message?: string | Error) => asserts condition;
};

const assertValue = (condition: unknown, message?: string | Error): asserts condition => {
  if (condition) return;
  if (message instanceof Error) throw message;
  throw new Error(message || "MDict assertion failed.");
};

const assert = assertValue as AssertFunction;
assert.ok = assertValue;

export default assert;
