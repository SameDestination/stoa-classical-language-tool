type LegacyConstructor = {
  (...args: unknown[]): unknown;
  prototype: object;
  super_?: LegacyConstructor;
};

/** Minimal Node `util` facade required by mdict-js' legacy BufferList build. */
export const inherits = (constructor: LegacyConstructor, superConstructor: LegacyConstructor) => {
  if (typeof constructor !== "function" || typeof superConstructor !== "function") {
    throw new TypeError("The constructor and super constructor must be functions.");
  }
  constructor.super_ = superConstructor;
  constructor.prototype = Object.create(superConstructor.prototype, {
    constructor: {
      configurable: true,
      enumerable: false,
      value: constructor,
      writable: true,
    },
  });
};

export const debuglog = () => (...values: unknown[]) => {
  void values;
};

export default { debuglog, inherits };
