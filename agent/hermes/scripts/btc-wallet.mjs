#!/usr/bin/env node
// GENERATED from web/scripts/agent-btc-wallet.ts by `bun run build:agent-btc` (in web/). Do not edit.

// scripts/agent-btc-wallet.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// node_modules/@noble/hashes/_u64.js
var U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0;i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
var shrSH = (h, _l, s) => h >>> s;
var shrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === undefined || value.length === length))
    return value;
  if (length !== undefined)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== undefined ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
  if (h.outputLen < 1 || h.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, undefined, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0;i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
var hasHexBuiltin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0;i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : undefined;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0;ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === undefined || n2 === undefined) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0;i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0;i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== undefined)
    aopts(opts, title);
  const merged = Object.assign(Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(undefined);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}

class HashMD {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0;pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (;blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0;i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);

class SHA2_32B extends HashMD {
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0;i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16;i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0;i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
}

class _SHA256 extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
}
var K512 = /* @__PURE__ */ (() => split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((n) => BigInt(n))))();
var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);

class SHA2_64B extends HashMD {
  Ah = 0;
  Al = 0;
  Bh = 0;
  Bl = 0;
  Ch = 0;
  Cl = 0;
  Dh = 0;
  Dl = 0;
  Eh = 0;
  El = 0;
  Fh = 0;
  Fl = 0;
  Gh = 0;
  Gl = 0;
  Hh = 0;
  Hl = 0;
  constructor(outputLen, IV) {
    super(128, outputLen, 16, false);
    this.Ah = IV[0] | 0;
    this.Al = IV[1] | 0;
    this.Bh = IV[2] | 0;
    this.Bl = IV[3] | 0;
    this.Ch = IV[4] | 0;
    this.Cl = IV[5] | 0;
    this.Dh = IV[6] | 0;
    this.Dl = IV[7] | 0;
    this.Eh = IV[8] | 0;
    this.El = IV[9] | 0;
    this.Fh = IV[10] | 0;
    this.Fl = IV[11] | 0;
    this.Gh = IV[12] | 0;
    this.Gl = IV[13] | 0;
    this.Hh = IV[14] | 0;
    this.Hl = IV[15] | 0;
  }
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0;i < 16; i++, offset += 4) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset += 4);
    }
    for (let i = 16;i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
      const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
      const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
      const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0;i < 80; i++) {
      const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
      const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
      const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const All = add3L(T1l, sigma0l, MAJl);
      Ah = add3H(All, T1h, sigma0h, MAJh);
      Al = All | 0;
    }
    ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
    ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
    ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
    ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
    ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
    ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
    ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
    ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    clean(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}

class _SHA512 extends SHA2_64B {
  constructor() {
    super(64, SHA512_IV);
  }
}
var sha256 = /* @__PURE__ */ createHasher(() => new _SHA256, /* @__PURE__ */ oidNist(1));
var sha512 = /* @__PURE__ */ createHasher(() => new _SHA512, /* @__PURE__ */ oidNist(3));

// node_modules/@noble/curves/utils.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function aarray(item, title, inner = () => {}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0;i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
var abytes2 = (value, length, title) => abytes(value, length, title);
var anumber2 = anumber;
function astring(value, title = "") {
  if (typeof value !== "string") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected string, got type=" + typeof value);
  }
  return value;
}
function aobject2(value, title = "object") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
  return value;
}
function afunction(value, title) {
  if (typeof value !== "function")
    throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
  return value;
}
var bytesToHex2 = bytesToHex;
var concatBytes2 = (...arrays) => concatBytes(...arrays);
var hexToBytes2 = (hex) => hexToBytes(hex);
var isBytes2 = isBytes;
var randomBytes2 = (bytesLength) => randomBytes(bytesLength);
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
var atitle2 = (title) => title ? `"${title}" ` : "";
function abool(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new RangeError("positive bigint expected, got " + n);
  } else
    anumber2(n);
  return n;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function numberToHexUnpadded(num) {
  const hex = abignumber(num).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  if (len === 0)
    throw new Error("zero output length is invalid");
  n = abignumber(n);
  const expectedLen = len * 2;
  const hex = n.toString(16);
  if (hex.length > expectedLen)
    throw new RangeError("number is too large");
  return hexToBytes(hex.padStart(expectedLen, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes2(bytes));
}
function asciiToBytes(ascii) {
  if (typeof ascii !== "string")
    throw new TypeError("ascii string expected, got " + typeof ascii);
  return Uint8Array.from(ascii, (c, i) => {
    const charCode = c.charCodeAt(0);
    if (c.length !== 1 || charCode > 127) {
      throw new RangeError(`string contains non-ASCII character "${ascii[i]}" with code ${charCode} at position ${i}`);
    }
    return charCode;
  });
}
function isPosBig(n) {
  return typeof n === "bigint" && _0n <= n;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  if (n < _0n)
    throw new Error("expected non-negative bigint, got " + n);
  return n === _0n ? 0 : n.toString(2).length;
}
var bitMask = (n) => {
  asafenumber(n, "n");
  return (_1n << BigInt(n)) - _1n;
};
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber(hashLen, "hashLen");
  anumber(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new TypeError("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1000;
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...msgs) => hmacFn(k, concatBytes2(v, ...msgs));
  const reseed = (seed = NULL) => {
    k = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = undefined;
    while ((res = pred(gen())) === undefined)
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}, title = "object") {
  aobject2(object, title);
  aobject2(fields, "fields");
  aobject2(optFields, "optFields");
  function checkField(fieldName, expectedType, isOpt) {
    const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
    const val = object[fieldName];
    if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== undefined : expectedType !== "function")) {
      throw new TypeError(`${label} is invalid: expected own property`);
    }
    if (isOpt && val === undefined)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}

// node_modules/@noble/curves/abstract/modular.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var _0n2 = /* @__PURE__ */ BigInt(0);
var _1n2 = /* @__PURE__ */ BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _15n = /* @__PURE__ */ BigInt(15);
var _16n = /* @__PURE__ */ BigInt(16);
var POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
function mod(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow: expected modulus > 1, got " + modulo);
  if (typeof power !== "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return _1n2;
  if (power === _1n2)
    return num;
  let d = num % modulo;
  if (d < _0n2)
    d += modulo;
  if (power < POW_WINDOWED_MIN) {
    let p = _1n2;
    while (power > _0n2) {
      if (power & _1n2)
        p = p * d % modulo;
      d = d * d % modulo;
      power >>= _1n2;
    }
    return p;
  }
  const digits = [];
  while (power > _0n2) {
    digits.push(Number(power & _15n));
    power >>= _4n;
  }
  const table = new Array(16);
  table[0] = _1n2;
  table[1] = d;
  for (let i = 2;i < 16; i++)
    table[i] = table[i - 1] * d % modulo;
  let p = table[digits[digits.length - 1]];
  for (let w = digits.length - 2;w >= 0; w--) {
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    const digit = digits[w];
    if (digit !== 0)
      p = p * table[digit] % modulo;
  }
  return p;
}
function pow2(x, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow2: expected modulus > 1, got " + modulo);
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _1n2)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, u = _1n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function invertCt(a, prime) {
  if (prime <= _1n2)
    throw new Error("invertCt: expected prime modulus > 1, got " + prime);
  const an = mod(a, prime);
  if (an === _0n2)
    throw new Error("invertCt: expected non-zero number");
  const inverse = pow(an, prime - _2n, prime);
  if (mod(an * inverse, prime) !== _1n2)
    throw new Error("invertCt: does not exist");
  return inverse;
}
function assertIsSquare(Fp, root, n) {
  const F = Fp;
  if (!F.eql(F.sqr(root), n))
    throw new Error("Cannot find square root");
}
function aoddModulus(order, fnName) {
  if ((order & _1n2) === _0n2)
    throw new Error(fnName + ": expected odd modulus, got " + order);
}
function sqrt3mod4(Fp, n) {
  const F = Fp;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n, p1div4);
  assertIsSquare(F, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const F = Fp;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n2 = F.mul(n, _2n);
  const v = F.pow(n2, p5div8);
  const nv = F.mul(n, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp, n) => {
    const F = Fp;
    let tv1 = F.pow(n, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n);
    const e2 = F.eql(F.sqr(tv3), n);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  aoddModulus(P, "tonelliShanks");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1000)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    const F = Fp;
    if (F.is0(n))
      return n;
    if (FpLegendre(F, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n, Q);
    let R = F.pow(n, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        throw new Error("Cannot find square root: probably non-prime P");
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  aoddModulus(P, "Fp.sqrt");
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  aobject2(field, "field");
  if (typeof field.ORDER !== "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  for (const name of FIELD_FIELDS)
    afunction(field[name], "field." + name);
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  validateField(Fp);
  aarray(nums, "nums");
  abool(passZero, "passZero");
  const F = Fp;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : undefined);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  validateField(Fp);
  const F = Fp;
  aoddModulus(F.ORDER, "FpLegendre");
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== undefined)
    anumber2(nBitLength);
  if (n <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n);
  if (nBitLength !== undefined && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n);
  if (nBitLength !== undefined && nBitLength < bits)
    throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
  const _nBitLength = nBitLength !== undefined ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
var FIELD_SQRT = new WeakMap;

class _Field {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = _0n2;
  ONE = _1n2;
  _lengths;
  _mod;
  constructor(ORDER, opts = {}) {
    if (ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
    let _nbitLength = undefined;
    this.isLE = false;
    if (opts != null && typeof opts === "object") {
      if (typeof opts.BITS === "number")
        _nbitLength = opts.BITS;
      if (typeof opts.sqrt === "function")
        Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
      if (typeof opts.isLE === "boolean")
        this.isLE = opts.isLE;
      if (opts.allowedLengths)
        this._lengths = Object.freeze(opts.allowedLengths.slice());
      if (typeof opts.modFromBytes === "boolean")
        this._mod = opts.modFromBytes;
    }
    const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
    if (nByteLength > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = ORDER;
    this.BITS = nBitLength;
    this.BYTES = nByteLength;
    Object.freeze(this);
  }
  create(num) {
    return mod(num, this.ORDER);
  }
  isValid(num) {
    if (typeof num !== "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof num);
    return _0n2 <= num && num < this.ORDER;
  }
  is0(num) {
    return num === _0n2;
  }
  isValidNot0(num) {
    return !this.is0(num) && this.isValid(num);
  }
  isOdd(num) {
    return (num & _1n2) === _1n2;
  }
  neg(num) {
    return mod(-num, this.ORDER);
  }
  eql(lhs, rhs) {
    return lhs === rhs;
  }
  sqr(num) {
    return mod(num * num, this.ORDER);
  }
  add(lhs, rhs) {
    return mod(lhs + rhs, this.ORDER);
  }
  sub(lhs, rhs) {
    return mod(lhs - rhs, this.ORDER);
  }
  mul(lhs, rhs) {
    return mod(lhs * rhs, this.ORDER);
  }
  pow(num, power) {
    return pow(num, power, this.ORDER);
  }
  div(lhs, rhs) {
    return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
  }
  sqrN(num) {
    return num * num;
  }
  addN(lhs, rhs) {
    return lhs + rhs;
  }
  subN(lhs, rhs) {
    return lhs - rhs;
  }
  mulN(lhs, rhs) {
    return lhs * rhs;
  }
  inv(num) {
    return invert(num, this.ORDER);
  }
  sqrt(num) {
    let sqrt = FIELD_SQRT.get(this);
    if (!sqrt)
      FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
    return sqrt(this, num);
  }
  toBytes(num) {
    return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
  }
  fromBytes(bytes, skipValidation = false) {
    abytes2(bytes);
    const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
    if (allowedLengths) {
      if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
        throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
      }
      const padded = new Uint8Array(BYTES);
      padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
      bytes = padded;
    }
    if (bytes.length !== BYTES)
      throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
    let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    if (modFromBytes)
      scalar = mod(scalar, ORDER);
    if (!skipValidation) {
      if (!this.isValid(scalar))
        throw new Error("invalid field element: outside of range 0..ORDER");
    }
    return scalar;
  }
  invertBatch(lst) {
    return FpInvertBatch(this, lst, true);
  }
  cmov(a, b, condition) {
    abool(condition, "condition");
    return condition ? b : a;
  }
}
function Field(ORDER, opts = {}) {
  Object.freeze(_Field.prototype);
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  if (fieldOrder <= _1n2)
    throw new Error("field order must be greater than 1");
  const bitLength = bitLen(fieldOrder - _1n2);
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE = false) {
  abytes2(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = Math.max(getMinHashLength(fieldOrder), 16);
  if (len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/abstract/curve.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var _0n3 = /* @__PURE__ */ BigInt(0);
var _1n3 = /* @__PURE__ */ BigInt(1);
var _4n2 = /* @__PURE__ */ BigInt(4);
var BLIND_BYTES = 16;
var BLIND_BITS = 128;
var FW_WINDOW = 5;
var TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
function validatePointCons(Point) {
  const pc = Point;
  if (typeof pc !== "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof Point);
  afunction(pc.fromAffine, "Point.fromAffine");
  afunction(pc.fromBytes, "Point.fromBytes");
  afunction(pc.fromHex, "Point.fromHex");
  aobject2(pc.BASE, "Point.BASE");
  aobject2(pc.ZERO, "Point.ZERO");
  validateField(pc.Fp);
  validateField(pc.Fn);
}
function normalizeZ(c, points) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits, min = 1) {
  if (!Number.isSafeInteger(W) || W < min || W > bits)
    throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
}
function validateTableBytes(numPoints, fpBytes) {
  const bytes = numPoints * (4 * fpBytes + 128);
  if (bytes > TABLE_BYTES_MAX)
    throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
}
function probeRandomBytes(randomBytes, length) {
  if (randomBytes === undefined)
    return;
  afunction(randomBytes, "randomBytes");
  try {
    const probe = randomBytes(length);
    if (!isBytes2(probe) || probe.length !== length)
      return;
  } catch {
    return;
  }
  return randomBytes;
}
function validateMSMPoints(points, c) {
  aarray(points, "points");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field, maxScalar) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    const ok = maxScalar === undefined ? field.isValid(s) : isPosBig(s) && s < maxScalar;
    if (!ok)
      throw new Error("invalid scalar at index " + i);
  });
}
var pointWindowSizes = new WeakMap;
function getWindowSize(P) {
  return pointWindowSizes.get(P) || 1;
}
function oddMultiples(p, size) {
  const dbl = p.double();
  const t = [p];
  for (let j = 1;j < size; j++)
    t.push(t[j - 1].add(dbl));
  return t;
}
function wnafDigits(n, W) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const d = [];
  while (n > _0n3) {
    let w = 0;
    if (n & _1n3) {
      w = Number(n & mask);
      if (w >= half)
        w -= size;
      n -= BigInt(w);
    }
    d.push(w);
    n >>= _1n3;
  }
  return d;
}
function signedWindowDigits(n, W, windows) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const shiftBy = BigInt(W);
  const d = [];
  for (let w = 0;w < windows; w++) {
    let v = Number(n & mask);
    n >>= shiftBy;
    if (v > half) {
      v -= size;
      n += _1n3;
    }
    d.push(v);
  }
  if (n !== _0n3)
    throw new Error("invalid wnaf");
  return d;
}
function wnafWalk(zero, tables, digits) {
  let max = 0;
  for (const d of digits)
    max = Math.max(max, d.length);
  let acc = zero;
  for (let bit = max - 1;bit >= 0; bit--) {
    if (bit !== max - 1)
      acc = acc.double();
    for (let i = 0;i < digits.length; i++) {
      const w = digits[i][bit];
      if (w) {
        const item = tables[i][Math.abs(w) - 1 >> 1];
        acc = acc.add(w < 0 ? item.negate() : item);
      }
    }
  }
  return acc;
}

class ScalarMultiplier {
  Point;
  BASE;
  ZERO;
  randomBytes;
  wnafPrecomputes = new WeakMap;
  baseCanBeBlinded;
  bits;
  constructor(Point, randomBytes) {
    validatePointCons(Point);
    this.randomBytes = probeRandomBytes(randomBytes, BLIND_BYTES);
    this.Point = Point;
    this.BASE = Point.BASE;
    this.ZERO = Point.ZERO;
    this.bits = Point.Fn.BITS;
  }
  buildWnafTable(point, W, bits) {
    const windows = Math.ceil(bits / W) + 1;
    const half = 2 ** (W - 1);
    const comp = [];
    let base = point;
    for (let w = 0;w < windows; w++) {
      let acc = base;
      for (let i = 0;i < half; i++) {
        comp.push(acc);
        acc = acc.add(base);
      }
      base = comp[comp.length - 1].double();
    }
    return { W, bits, windows, comp };
  }
  wnafCachedCT(precomputes, n) {
    const { W, windows, comp } = precomputes;
    const half = 2 ** (W - 1);
    const digits = signedWindowDigits(n, W, windows);
    let p = this.ZERO;
    let f = this.BASE;
    for (let w = 0;w < windows; w++) {
      const digit = digits[w];
      const start = w * half;
      const idx = Math.abs(digit) - 1;
      let sel = comp[start];
      for (let i = 1;i < half; i++)
        sel = i === idx ? comp[start + i] : sel;
      const neg = sel.negate();
      if (digit === 0)
        f = f.add(comp[start]);
      else
        p = p.add(digit < 0 ? neg : sel);
    }
    return { p, f };
  }
  getWnafPrecomputes(W, point, bits, transform) {
    let entries = this.wnafPrecomputes.get(point);
    let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
    if (!comp) {
      comp = this.buildWnafTable(point, W, bits);
      if (typeof transform === "function")
        comp = { ...comp, comp: transform(comp.comp) };
      if (!entries) {
        entries = [];
        this.wnafPrecomputes.set(point, entries);
      }
      entries.push(comp);
    }
    return comp;
  }
  assertPoint(point) {
    if (!(point instanceof this.Point))
      throw new TypeError('"point" expected Point instance, got type=' + typeof point);
  }
  validateMulInput(point, scalar) {
    this.assertPoint(point);
    if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  runCT(point, n, bits, transform) {
    const W = getWindowSize(point);
    if (W === 1)
      return this.fixedWindowCT(point, n, bits);
    return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
  }
  mulCT(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    return this.runCT(point, scalar, this.bits, transform);
  }
  mulCTBlinded(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    if (this.randomBytes === undefined)
      throw new Error("randomBytes is required for scalar blinding");
    const bits = this.Point.Fn.BITS + BLIND_BITS;
    const blind = this.randomBytes(BLIND_BYTES);
    if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
      throw new Error("randomBytes returned invalid byte array");
    blind[0] = blind[0] & 63 | 128;
    const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
    return this.runCT(point, n, bits, transform);
  }
  fixedWindowCT(point, n, bits) {
    const W = FW_WINDOW;
    const size = 1 << W;
    const mask = bitMask(W);
    const table = new Array(size);
    table[0] = this.ZERO;
    for (let i = 1;i < size; i++)
      table[i] = table[i - 1].add(point);
    const windows = Math.ceil(bits / W);
    let acc = this.ZERO;
    for (let window = windows - 1;window >= 0; window--) {
      if (window !== windows - 1)
        for (let d = 0;d < W; d++)
          acc = acc.double();
      const digit = Number(n >> BigInt(window * W) & mask);
      let sel = table[0];
      for (let i = 1;i < size; i++)
        sel = i === digit ? table[i] : sel;
      acc = acc.add(sel);
    }
    return { p: acc, f: acc };
  }
  shouldBlind(point, cofactor) {
    if (this.randomBytes === undefined)
      return false;
    if (cofactor === _1n3)
      return true;
    if (point !== this.BASE)
      return false;
    if (this.baseCanBeBlinded === undefined)
      this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
    return this.baseCanBeBlinded;
  }
  mulSecret(point, scalar, cofactor, transform) {
    return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
  }
  mulUnsafe(point, scalar, transform) {
    this.assertPoint(point);
    if (!isPosBig(scalar))
      throw new Error("invalid scalar");
    const W = getWindowSize(point);
    if (W === 1 || scalar >= this.Point.Fn.ORDER)
      return mulAddUnsafe(this.Point, [point], [scalar], true);
    const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
    return this.wnafCachedCT(precomputes, scalar).p;
  }
  setWindowSize(point, W) {
    this.assertPoint(point);
    validateW(W, this.bits);
    const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
    validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
    pointWindowSizes.set(point, W);
    this.wnafPrecomputes.delete(point);
  }
  hasWindowSize(point) {
    return getWindowSize(point) !== 1;
  }
}
function mulAddUnsafe(c, points, scalars, allowOversized = false) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  abool(allowOversized, "allowOversized");
  validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : undefined);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const tables = points.map((p) => oddMultiples(p, 4));
  const digits = scalars.map((n) => wnafDigits(n, 4));
  return wnafWalk(c.ZERO, tables, digits);
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (type !== "weierstrass" && type !== "edwards")
    throw new Error('expected curve type "weierstrass" or "edwards"');
  if (FpFnLE === undefined)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  validateObject(curveOpts);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(isPosBig(val) && val !== _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}
function createKeygen(randomSecretKey, getPublicKey) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  };
}

// node_modules/@noble/hashes/hmac.js
class _HMAC {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = false;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes(key, undefined, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0;i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0;i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const buf = out.subarray(0, this.outputLen);
    this.iHash.digestInto(buf);
    this.oHash.update(buf);
    this.oHash.digestInto(buf);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.canXOF = canXOF;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
}
var hmac = /* @__PURE__ */ (() => {
  const hmac_ = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
  hmac_.create = (hash, key) => new _HMAC(hash, key);
  return hmac_;
})();

// node_modules/@noble/curves/abstract/der.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var _0n4 = /* @__PURE__ */ BigInt(0);

class DERErr extends Error {
  constructor(m = "") {
    super(m);
  }
}
var _DER = {
  Err: DERErr,
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = _DER;
      asafenumber(tag, "tag");
      if (tag < 0 || tag > 255)
        throw new E("tlv.encode: wrong tag");
      astring(data, "data");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    decode(tag, data) {
      const { Err: E } = _DER;
      data = abytes2(data, undefined, "DER data");
      let pos = 0;
      if (tag < 0 || tag > 255)
        throw new E("tlv.decode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  _int: {
    encode(num) {
      const { Err: E } = _DER;
      abignumber(num);
      if (num < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = _DER;
      if (data.length < 1)
        throw new E("invalid signature integer: empty");
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data.length > 1 && data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(bytes, maxScalarBytes) {
    const { Err: E, _int: int, _tlv: tlv } = _DER;
    if (maxScalarBytes !== undefined) {
      asafenumber(maxScalarBytes, "maxScalarBytes");
      if (maxScalarBytes < 1)
        throw new E("invalid signature: maxScalarBytes must be positive");
    }
    const data = abytes2(bytes, undefined, "signature");
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    if (maxScalarBytes !== undefined && (rBytes.length > maxScalarBytes || sBytes.length > maxScalarBytes))
      throw new E("invalid signature: integer too large");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = _DER;
    validateObject(sig, { r: "bigint", s: "bigint" }, {}, "sig");
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var DER = /* @__PURE__ */ (() => {
  Object.freeze(_DER._tlv);
  Object.freeze(_DER._int);
  return Object.freeze(_DER);
})();

// node_modules/@noble/curves/abstract/weierstrass.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  aInRange("scalar", k, _0n5, n);
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n5;
  const k2neg = k2 < _0n5;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n5 || k1 >= MAX_NUM || k2 < _0n5 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed for k");
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  validateObject(opts);
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === undefined ? def[optName] : opts[optName];
  }
  abool(optsn.lowS, "lowS");
  abool(optsn.prehash, "prehash");
  if (optsn.format !== undefined)
    validateSigFormat(optsn.format);
  return optsn;
}
var _0n5 = /* @__PURE__ */ BigInt(0);
var _1n4 = /* @__PURE__ */ BigInt(1);
var _2n2 = /* @__PURE__ */ BigInt(2);
var _3n2 = /* @__PURE__ */ BigInt(3);
var _4n3 = /* @__PURE__ */ BigInt(4);
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const Fp = validated.Fp;
  const Fn = validated.Fn;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: endoOpts, allowInfinityPoint, clearCofactor, isTorsionFree, fromBytes, toBytes } = extraOpts;
  const randomBytes = extraOpts.randomBytes === undefined ? randomBytes2 : extraOpts.randomBytes;
  if (endoOpts) {
    if (!Fp.is0(CURVE.a) || typeof endoOpts.beta !== "bigint" || !Array.isArray(endoOpts.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const endo = endoOpts ? {
    beta: endoOpts.beta,
    basises: endoOpts.basises.map((basis) => [...basis])
  } : undefined;
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    if (point.is0()) {
      if (!allowInfinityPoint)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    abool(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes2(pprefix(hasEvenY), bx);
    } else {
      return concatBytes2(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes2(bytes, undefined, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (allowInfinityPoint && length === 1 && head === 0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = toBytes === undefined ? pointToBytes : toBytes;
  const decodePoint = fromBytes === undefined ? pointFromBytes : fromBytes;
  const b3 = Fp.mul(CURVE.b, _3n2);
  const mulA = Fp.is0(CURVE.a) ? (_) => Fp.ZERO : (x) => Fp.mul(CURVE.a, x);
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n3);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return typeof n === "object" && n !== null ? Fp.create(n) : n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  function pushWnafPair(points, scalars, p, k) {
    if (!Fn.isValid(k))
      throw new RangeError("invalid scalar: out of range");
    if (endo) {
      const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(k);
      const psi = new Point(Fp.mul(p.X, endo.beta), p.Y, p.Z);
      points.push(k1neg ? p.negate() : p, k2neg ? psi.negate() : psi);
      scalars.push(k1, k2);
    } else {
      points.push(p);
      scalars.push(k);
    }
  }
  const validityCache = new WeakSet;

  class Point {
    static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
    static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
    static Fp = Fp;
    static Fn = Fn;
    X;
    Y;
    Z;
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(abytes2(bytes, undefined, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(hexToBytes2(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    assertValidity() {
      const p = this;
      if (p.is0()) {
        if (allowInfinityPoint && Fp.is0(p.X) && Fp.eql(p.Y, Fp.ONE) && Fp.is0(p.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (validityCache.has(p))
        return;
      const { x, y } = p.toAffine();
      if (!Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("bad point: x or y not field elements");
      if (!isValidXY(x, y))
        throw new Error("bad point: equation left != right");
      if (!p.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      validityCache.add(p);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let { ZERO: X3, ZERO: Y3, ZERO: Z3 } = Fp;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = mulA(Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = mulA(t2);
      t3 = Fp.sub(t0, t2);
      t3 = mulA(t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let { ZERO: X3, ZERO: Y3, ZERO: Z3 } = Fp;
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = mulA(t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = mulA(t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = mulA(t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      aprjpoint(other);
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    multiply(scalar) {
      if (!Fn.isValidNot0(scalar))
        throw new RangeError("invalid scalar: out of range");
      const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize);
      return normalize([p, f])[0];
    }
    multiplyUnsafe(scalar) {
      const p = this;
      const sc = scalar;
      if (!Fn.isValid(sc))
        throw new RangeError("invalid scalar: out of range");
      if (sc === _0n5 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasWindowSize(this))
        return wnaf.mulUnsafe(p, sc, normalize);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, p, sc);
      return mulAddUnsafe(Point, points, scalars);
    }
    mulAddUnsafe(a, other, b) {
      aprjpoint(other);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, this, a);
      pushWnafPair(points, scalars, other, b);
      return mulAddUnsafe(Point, points, scalars);
    }
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && !Fp.isValid(iz))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X, Y, Z } = p;
      if (Fp.eql(Z, Fp.ONE))
        return { x: X, y: Y };
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp.ONE : Fp.inv(Z);
      const x = Fp.mul(X, iz);
      const y = Fp.mul(Y, iz);
      const zz = Fp.mul(Z, iz);
      if (is0)
        return { x: Fp.ZERO, y: Fp.ZERO };
      if (!Fp.eql(zz, Fp.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    isTorsionFree() {
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.mulUnsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      if (cofactor === _1n4)
        return this.is0();
      return this.clearCofactor().is0();
    }
    toBytes(isCompressed = true) {
      abool(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex2(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize = (points) => normalizeZ(Point, points);
  const wnaf = new ScalarMultiplier(Point, randomBytes);
  if (wnaf.bits >= 6)
    Point.BASE.precompute(6);
  Object.freeze(Point.prototype);
  Object.freeze(Point);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  validatePointCons(Point);
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes === undefined ? randomBytes2 : ecdhOpts.randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), {
    seed: Math.max(getMinHashLength(Fn.ORDER), 16)
  });
  function isValidSecretKey(secretKey) {
    try {
      const num = Fn.fromBytes(secretKey);
      return Fn.isValidNot0(num);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !Point.fromBytes(publicKey).is0();
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed) {
    seed = seed === undefined ? randomBytes_(lengths.seed) : seed;
    return mapHashToField(abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey(secretKey, isCompressed = true) {
    return Point.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    const allowedLengths = Fn._lengths;
    if (!isBytes2(item))
      return;
    const l = abytes2(item, undefined, "key").length;
    const isPub = l === publicKey || l === publicKeyUncompressed;
    const isSec = l === secretKey || !!allowedLengths?.includes(l);
    if (isPub && isSec)
      return;
    return isPub;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn.fromBytes(secretKeyA);
    const b = Point.fromBytes(publicKeyB);
    if (b.is0())
      throw new Error("invalid public key: point at infinity");
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey);
  Object.freeze(utils);
  Object.freeze(lengths);
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  validatePointCons(Point);
  const hash_ = hash;
  ahash(hash_);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const opts = Object.assign({}, ecdsaOpts);
  const randomBytes = opts.randomBytes === undefined ? randomBytes2 : opts.randomBytes;
  const hmac2 = opts.hmac === undefined ? (key, msg) => hmac(hash_, key, msg) : opts.hmac;
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const blindLength = getMinHashLength(CURVE_ORDER);
  const csprng = probeRandomBytes(randomBytes, blindLength);
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, opts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof opts.lowS === "boolean" ? opts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeRecoveryLifts = CURVE_ORDER * _2n2 + _1n4 < Fp.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num) {
    if (!Fn.isValidNot0(num))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num;
  }
  function assertFieldSignIsSupported() {
    if (!Fp.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function getRecoveryBit(x, y, r) {
    assertFieldSignIsSupported();
    return (x === r ? 0 : 2) | Number(Fp.isOdd(y));
  }
  function assertRecoverableCurve() {
    if (hasLargeRecoveryLifts)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : undefined;
    return abytes2(bytes, sizer);
  }

  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertRecoverableCurve();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        if (bytes.length > 2 * Fn.BYTES + 16)
          throw new DER.Err("invalid signature: DER signature too long");
        const { r, s } = DER.toSig(abytes2(bytes), Fn.BYTES + 1);
        return new Signature(r, s);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes2(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes2(pprefix((recovery & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(abytes2(messageHash, undefined, "msgHash"));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.mulAddUnsafe(u1, R, u2);
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes2(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn.toBytes(r);
      const sb = Fn.toBytes(s);
      if (format === "recovered") {
        assertRecoverableCurve();
        return concatBytes2(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes2(rb, sb);
    }
    toHex(format) {
      return bytesToHex2(this.toBytes(format));
    }
  }
  Object.freeze(Signature.prototype);
  Object.freeze(Signature);
  const bits2int = opts.bits2int === undefined ? function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num >> BigInt(delta) : num;
  } : opts.bits2int;
  const bits2int_modN = opts.bits2int_modN === undefined ? function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  } : opts.bits2int_modN;
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num) {
    aInRange("num < 2^" + fnBits, num, _0n5, ORDER_MASK);
    return Fn.toBytes(num);
  }
  function validateMsgAndHash(message, prehash) {
    abytes2(message, undefined, "message");
    return prehash ? abytes2(hash_(message), undefined, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn.fromBytes(secretKey);
    if (!Fn.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes2(e, undefined, "extraEntropy"));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n5)
        return;
      let s;
      if (csprng !== undefined) {
        const b = bytesToNumberBE(mapHashToField(csprng(blindLength), CURVE_ORDER));
        const ibk = Fn.inv(Fn.mul(b, k));
        const bm = Fn.mul(b, m);
        const bd = Fn.mul(b, d);
        s = Fn.create(ibk * Fn.create(bm + bd * r));
      } else {
        const ik = invertCt(k, CURVE_ORDER);
        s = Fn.create(ik * Fn.create(m + r * d));
      }
      if (s === _0n5)
        return;
      let recovery = getRecoveryBit(q.x, q.y, r);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeRecoveryLifts ? undefined : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash_.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts.format);
  }
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = abytes2(publicKey, undefined, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes2(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point.fromBytes(publicKey);
      if (P.is0())
        return false;
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.mulAddUnsafe(u1, P, u2);
      if (R.is0())
        return false;
      const q = R.toAffine();
      const v = Fn.create(q.x);
      if (v !== r)
        return false;
      if (format === "recovered" && sig.recovery !== getRecoveryBit(q.x, q.y, r))
        return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash: hash_
  });
}

// node_modules/@noble/curves/secp256k1.js
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _0n6 = /* @__PURE__ */ BigInt(0);
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n, P) * b3 % P;
  const b9 = pow2(b6, _3n, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = /* @__PURE__ */ Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
  Fp: Fpk1,
  endo: secp256k1_ENDO
});
var secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);
var TAGGED_HASH_PREFIXES = Object.create(null);
function taggedHash(tag, ...messages) {
  let tagP = TAGGED_HASH_PREFIXES[tag];
  if (tagP === undefined) {
    const tagH = sha256(asciiToBytes(tag));
    tagP = concatBytes2(tagH, tagH);
    TAGGED_HASH_PREFIXES[tag] = tagP;
  }
  return sha256(concatBytes2(tagP, ...messages));
}
var pointToBytes = (point) => point.toBytes(true).slice(1);
var affineXToBytes = ({ x }) => Fpk1.toBytes(x);
var hasEven = (y) => !Fpk1.isOdd(y);
function schnorrGetExtPubKey(priv) {
  const { Fn, BASE } = Pointk1;
  const d_ = Fn.fromBytes(abytes2(priv, 32, "secretKey"));
  const p = BASE.multiply(d_);
  const affine = p.toAffine();
  const scalar = hasEven(affine.y) ? d_ : Fn.neg(d_);
  return { scalar, bytes: affineXToBytes(affine) };
}
function lift_x(x) {
  const Fp = Fpk1;
  if (!Fp.isValidNot0(x))
    throw new Error("invalid x: Fail if x ≥ p");
  const xx = Fp.sqr(x);
  const c = Fp.add(Fp.mulN(xx, x), BigInt(7));
  let y = Fp.sqrt(c);
  if (!hasEven(y))
    y = Fp.neg(y);
  const p = Pointk1.fromAffine({ x, y });
  p.assertValidity();
  return p;
}
var num = bytesToNumberBE;
function challenge(...args) {
  return Pointk1.Fn.create(num(taggedHash("BIP0340/challenge", ...args)));
}
function schnorrGetPublicKey(secretKey) {
  return schnorrGetExtPubKey(secretKey).bytes;
}
function schnorrSign(message, secretKey, auxRand = randomBytes(32)) {
  const { Fn, BASE } = Pointk1;
  const m = copyBytes(abytes2(message, undefined, "message"));
  const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey);
  const a = abytes2(auxRand, 32, "auxRand");
  const t = Fn.toBytes(d ^ num(taggedHash("BIP0340/aux", a)));
  const rand = taggedHash("BIP0340/nonce", t, px, m);
  const k_ = Fn.create(num(rand));
  if (k_ === _0n6)
    throw new Error("sign failed: k is zero");
  const p = BASE.multiply(k_);
  const affine = p.toAffine();
  const k = hasEven(affine.y) ? k_ : Fn.neg(k_);
  const rx = affineXToBytes(affine);
  const e = challenge(rx, px, m);
  const sig = new Uint8Array(64);
  sig.set(rx, 0);
  sig.set(Fn.toBytes(Fn.create(k + e * d)), 32);
  if (!schnorrVerify(sig, m, px))
    throw new Error("sign: Invalid signature produced");
  return sig;
}
function schnorrVerify(signature, message, publicKey) {
  const { Fp, Fn, BASE } = Pointk1;
  const sig = abytes2(signature, 64, "signature");
  const m = abytes2(message, undefined, "message");
  const pub = abytes2(publicKey, 32, "publicKey");
  try {
    const P = lift_x(num(pub));
    const rBytes = sig.subarray(0, 32);
    const r = num(rBytes);
    if (!Fp.isValidNot0(r))
      return false;
    const s = num(sig.subarray(32, 64));
    if (!Fn.isValidNot0(s))
      return false;
    const e = challenge(rBytes, pointToBytes(P), m);
    const R = BASE.mulAddUnsafe(s, P, Fn.neg(e));
    const { x, y } = R.toAffine();
    if (R.is0() || !hasEven(y) || !Fp.eql(x, r))
      return false;
    return true;
  } catch (error) {
    return false;
  }
}
var schnorr = /* @__PURE__ */ (() => {
  const size = 32;
  const seedLength = 48;
  const randomSecretKey = (seed) => {
    seed = seed === undefined ? randomBytes(seedLength) : seed;
    return mapHashToField(abytes2(seed, seedLength, "seed"), secp256k1_CURVE.n);
  };
  return Object.freeze({
    keygen: createKeygen(randomSecretKey, schnorrGetPublicKey),
    getPublicKey: schnorrGetPublicKey,
    sign: schnorrSign,
    verify: schnorrVerify,
    Point: Pointk1,
    utils: Object.freeze({
      randomSecretKey,
      taggedHash,
      lift_x,
      pointToBytes
    }),
    lengths: Object.freeze({
      secretKey: size,
      publicKey: size,
      publicKeyHasPrefix: false,
      signature: size * 2,
      seed: seedLength
    })
  });
})();

// node_modules/@noble/hashes/legacy.js
var Rho160 = /* @__PURE__ */ Uint8Array.from([
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8
]);
var Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
var Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
var idxLR = /* @__PURE__ */ (() => {
  const L = [Id160];
  const R = [Pi160];
  const res = [L, R];
  for (let i = 0;i < 4; i++)
    for (let j of res)
      j.push(j[i].map((k) => Rho160[k]));
  return res;
})();
var idxL = /* @__PURE__ */ (() => idxLR[0])();
var idxR = /* @__PURE__ */ (() => idxLR[1])();
var shifts160 = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((i) => Uint8Array.from(i));
var shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
var shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
var Kl160 = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]);
var Kr160 = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function ripemd_f(group, x, y, z) {
  if (group === 0)
    return x ^ y ^ z;
  if (group === 1)
    return x & y | ~x & z;
  if (group === 2)
    return (x | ~y) ^ z;
  if (group === 3)
    return x & z | y & ~z;
  return x ^ (y | ~z);
}
var BUF_160 = /* @__PURE__ */ new Uint32Array(16);

class _RIPEMD160 extends HashMD {
  h0 = 1732584193 | 0;
  h1 = 4023233417 | 0;
  h2 = 2562383102 | 0;
  h3 = 271733878 | 0;
  h4 = 3285377520 | 0;
  constructor() {
    super(64, 20, 8, true);
  }
  get() {
    const { h0, h1, h2, h3, h4 } = this;
    return [h0, h1, h2, h3, h4];
  }
  set(h0, h1, h2, h3, h4) {
    this.h0 = h0 | 0;
    this.h1 = h1 | 0;
    this.h2 = h2 | 0;
    this.h3 = h3 | 0;
    this.h4 = h4 | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0;i < 16; i++, offset += 4)
      BUF_160[i] = view.getUint32(offset, true);
    let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
    for (let group = 0;group < 5; group++) {
      const rGroup = 4 - group;
      const hbl = Kl160[group], hbr = Kr160[group];
      const rl = idxL[group], rr = idxR[group];
      const sl = shiftsL160[group], sr = shiftsR160[group];
      for (let i = 0;i < 16; i++) {
        const tl = rotl(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el | 0;
        al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl;
      }
      for (let i = 0;i < 16; i++) {
        const tr = rotl(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er | 0;
        ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr;
      }
    }
    this.set(this.h1 + cl + dr | 0, this.h2 + dl + er | 0, this.h3 + el + ar | 0, this.h4 + al + br | 0, this.h0 + bl + cr | 0);
  }
  roundClean() {
    clean(BUF_160);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0);
  }
}
var ripemd160 = /* @__PURE__ */ createHasher(() => new _RIPEMD160);

// node_modules/@scure/base/index.js
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
var freeze = (fn) => Object.freeze(fn());
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function abytes3(b) {
  if (!isBytes3(b))
    throw new TypeError("Uint8Array expected");
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new TypeError("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new TypeError(`${label}: string expected`);
  return true;
}
function anumber3(n, title = "number") {
  if (typeof n !== "number")
    throw new TypeError(`${title}: expected number, got ${typeof n}`);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`${title}: expected safe integer, got ${n}`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new TypeError(`${label}: array of numbers expected`);
}
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
function normalize(fn) {
  afn(fn);
  return { encode: (from) => from, decode: (to) => fn(to) };
}
var powers = /* @__PURE__ */ (() => {
  let res = [];
  for (let i = 0;i < 40; i++)
    res.push(2 ** i);
  return res;
})();
function u8ToNumArr(u8, len = u8.length) {
  const res = new Array(len);
  for (let i = 0;i < len; i++)
    res[i] = u8[i];
  return res;
}
var asciiDecoder = /* @__PURE__ */ (() => {
  try {
    const decoder = new TextDecoder;
    return decoder.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+" ? decoder : undefined;
  } catch (e) {
    return;
  }
})();
var B2S_CHUNK = 8192;
function charcodesToString(codes) {
  const len = codes.length;
  if (asciiDecoder !== undefined && len >= 12)
    return asciiDecoder.decode(codes);
  if (len <= B2S_CHUNK)
    return String.fromCharCode.apply(null, codes);
  let res = "";
  for (let i = 0;i < len; i += B2S_CHUNK)
    res += String.fromCharCode.apply(null, codes.subarray(i, i + B2S_CHUNK));
  return res;
}
function radix2(bits) {
  anumber3(bits);
  if (bits <= 0 || bits > 8)
    throw new RangeError("radix2: bits should be in (0..8]");
  const mask = powers[bits] - 1;
  return {
    encode: (bytes) => {
      abytes3(bytes);
      const len = bytes.length;
      const res = new Uint8Array(Math.ceil(len * 8 / bits));
      let carry = 0;
      let pos = 0;
      let j = 0;
      for (let i = 0;i < len; ) {
        if (i + 2 < len) {
          carry = carry << 24 | bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
          pos += 24;
          i += 3;
        } else {
          carry = (carry << 8 | bytes[i]) & 65535;
          pos += 8;
          i++;
        }
        for (;; ) {
          pos -= bits;
          res[j++] = carry >> pos & mask;
          if (pos < bits)
            break;
        }
      }
      if (pos > 0)
        res[j] = carry << bits - pos & mask;
      return res;
    },
    decode: (digits) => {
      const len = digits.length;
      const res = new Uint8Array(Math.floor(len * bits / 8));
      let carry = 0;
      let pos = 0;
      let j = 0;
      for (let i = 0;i < len; i++) {
        carry = (carry << bits | digits[i]) & 65535;
        pos += bits;
        for (;pos >= 8; pos -= 8)
          res[j++] = carry >> pos - 8 & 255;
      }
      carry = carry << 8 - pos & 255;
      if (pos >= bits)
        throw new Error("Excess padding");
      if (carry > 0)
        throw new Error(`Non-zero padding: ${carry}`);
      return res;
    }
  };
}
function alphabet(letters, aliases) {
  const len = letters.length;
  if (len > 128)
    throw new Error("alphabet: max 128 letters");
  const encTable = new Uint8Array(len);
  const decTable = new Int8Array(128).fill(-1);
  for (let i = 0;i < len; i++) {
    const code = letters.charCodeAt(i);
    if (letters.codePointAt(i) !== code || code > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    encTable[i] = code;
    decTable[code] = i;
  }
  if (aliases !== undefined) {
    for (const alias of Object.keys(aliases)) {
      const code = alias.charCodeAt(0);
      const target = decTable[aliases[alias].charCodeAt(0)];
      if (alias.length !== 1 || code > 127 || target === undefined || target === -1)
        throw new Error(`alphabet: invalid alias ${alias}`);
      decTable[code] = target;
    }
  }
  return {
    encode: (digits) => {
      const codes = new Uint8Array(digits.length);
      for (let i = 0;i < digits.length; i++) {
        const d = digits[i];
        const code = encTable[d];
        if (code === undefined)
          throw new Error(`alphabet.encode: invalid digit ${d}`);
        codes[i] = code;
      }
      return charcodesToString(codes);
    },
    decode: (input) => {
      astr("decode", input);
      const slen = input.length;
      const digits = new Uint8Array(slen);
      for (let i = 0;i < slen; i++) {
        const code = input.charCodeAt(i);
        const digit = code < 128 ? decTable[code] : -1;
        if (digit === -1)
          throw new Error(`Unknown letter "${input[i]}". Allowed: ${letters}`);
        digits[i] = digit;
      }
      return digits;
    }
  };
}
function unsafeWrapper(fn) {
  afn(fn);
  return function(...args) {
    try {
      return fn.apply(null, args);
    } catch (e) {}
  };
}
function checksum(len, fn) {
  anumber3(len);
  if (len <= 0)
    throw new RangeError(`checksum length must be positive: ${len}`);
  afn(fn);
  const _fn = fn;
  return {
    encode(data) {
      abytes3(data);
      const sum = _fn(data).slice(0, len);
      const res = new Uint8Array(data.length + len);
      res.set(data);
      res.set(sum, data.length);
      return res;
    },
    decode(data) {
      abytes3(data);
      const payload = data.slice(0, -len);
      const oldChecksum = data.slice(-len);
      const newChecksum = _fn(payload).slice(0, len);
      for (let i = 0;i < len; i++)
        if (newChecksum[i] !== oldChecksum[i])
          throw new Error("Invalid checksum");
      return payload;
    }
  };
}
var B58_GROUP = 656356768;
var RADIX_BASE_N_MAX_LENGTH = 65536;
var BASE_N_MAX_BYTES = 2048;
var BASE_N_MAX_CHARS = 4096;
var radixBaseN = (BASE, GROUP) => ({
  encode: (bytes) => {
    abytes3(bytes);
    const blen = bytes.length;
    if (blen === 0)
      return new Uint8Array(0);
    if (blen >= RADIX_BASE_N_MAX_LENGTH)
      throw new Error("invalid length");
    let zeros = 0;
    while (zeros < blen - 1 && bytes[zeros] === 0)
      zeros++;
    const nlimbs = Math.ceil(blen / 2);
    const limbs = new Uint16Array(nlimbs);
    const odd = blen & 1;
    if (odd)
      limbs[0] = bytes[0];
    for (let i = odd, j = odd;i < blen; i += 2, j++)
      limbs[j] = bytes[i] << 8 | bytes[i + 1];
    const groups = [];
    let pos = 0;
    while (pos < nlimbs) {
      let carry = 0;
      for (let i = pos;i < nlimbs; i++) {
        const cur = carry * 65536 + limbs[i];
        const q = Math.floor(cur / GROUP);
        carry = cur - q * GROUP;
        limbs[i] = q;
        if (q === 0 && i === pos)
          pos++;
      }
      groups.push(carry);
    }
    const top = groups.length - 1;
    let sig = top * 5;
    for (let v = groups[top];; v = Math.floor(v / BASE)) {
      sig++;
      if (v < BASE)
        break;
    }
    const res = new Uint8Array(zeros + sig);
    let j = res.length - 1;
    for (let g = 0;g < top; g++) {
      let v = groups[g];
      for (let k = 0;k < 5; k++) {
        res[j--] = v % BASE;
        v = Math.floor(v / BASE);
      }
    }
    for (let v = groups[top];j >= zeros; v = Math.floor(v / BASE))
      res[j--] = v % BASE;
    return res;
  },
  decode: (digits) => {
    abytes3(digits);
    const dlen = digits.length;
    if (dlen === 0)
      return new Uint8Array(0);
    if (dlen >= RADIX_BASE_N_MAX_LENGTH)
      throw new Error("invalid length");
    let zeros = 0;
    while (zeros < dlen - 1 && digits[zeros] === 0)
      zeros++;
    const limbs = new Uint16Array(Math.ceil(dlen * 6 / 16) + 1);
    let used = 0;
    let i = 0;
    let group = dlen % 5 || 5;
    while (i < dlen) {
      let gval = 0;
      let factor = 1;
      for (const end = i + group;i < end; i++) {
        const d = digits[i];
        if (d >= BASE)
          throw new Error(`invalid integer: ${d}`);
        gval = gval * BASE + d;
        factor *= BASE;
      }
      group = 5;
      let carry = gval;
      for (let k = 0;k < used; k++) {
        const cur = limbs[k] * factor + carry;
        carry = Math.floor(cur / 65536);
        limbs[k] = cur - carry * 65536;
      }
      for (;carry > 0; carry = Math.floor(carry / 65536))
        limbs[used++] = carry % 65536;
    }
    const valueBytes = used === 0 ? 1 : used * 2 - (limbs[used - 1] < 256 ? 1 : 0);
    const res = new Uint8Array(zeros + valueBytes);
    let j = res.length - 1;
    for (let k = 0;k < used; k++) {
      const limb = limbs[k];
      res[j--] = limb & 255;
      if (j >= zeros)
        res[j--] = limb >> 8;
    }
    return res;
  }
});
var genBaseN = (radix, abc) => {
  const letters = alphabet(abc);
  return {
    encode(bytes) {
      abytes3(bytes);
      if (bytes.length > BASE_N_MAX_BYTES)
        throw new Error("invalid length");
      return letters.encode(radix.encode(bytes));
    },
    decode(str) {
      astr("baseN.decode", str);
      if (str.length > BASE_N_MAX_CHARS)
        throw new Error("invalid length");
      return radix.decode(letters.decode(str));
    }
  };
};
var radix58 = /* @__PURE__ */ radixBaseN(58, B58_GROUP);
var genBase58 = (abc) => genBaseN(radix58, abc);
var base58 = /* @__PURE__ */ freeze(() => genBase58("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"));
var createBase58check = (sha256) => {
  afn(sha256);
  const _sha256 = sha256;
  return chain(checksum(4, (data) => _sha256(_sha256(data))), base58);
};
var base58check = createBase58check;
var BECH_ALPHABET = /* @__PURE__ */ alphabet("qpzry9x8gf2tvdw0s3jn54khce6mua7l");
var BECH_UPPERCASE_PRINTABLE = /^[\x21-\x60\x7b-\x7e]+$/;
function assertBech32Printable(label, value) {
  for (let i = 0;i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`${label}: printable ASCII expected`);
  }
}
function wordsToU8(words) {
  const len = words.length;
  const res = new Uint8Array(len);
  for (let i = 0;i < len; i++) {
    const w = words[i];
    if (w < 0 || w >= 32)
      throw new Error(`alphabet.encode: invalid digit ${w}`);
    res[i] = w;
  }
  return res;
}
var POLYMOD_GENERATORS = [996825010, 642813549, 513874426, 1027748829, 705979059];
function bech32Polymod(pre) {
  const b = pre >> 25;
  let chk = (pre & 33554431) << 5;
  for (let i = 0;i < POLYMOD_GENERATORS.length; i++) {
    if ((b >> i & 1) === 1)
      chk ^= POLYMOD_GENERATORS[i];
  }
  return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
  const len = prefix.length;
  let chk = 1;
  for (let i = 0;i < len; i++) {
    const c = prefix.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`Invalid prefix (${prefix})`);
    chk = bech32Polymod(chk) ^ c >> 5;
  }
  chk = bech32Polymod(chk);
  for (let i = 0;i < len; i++)
    chk = bech32Polymod(chk) ^ prefix.charCodeAt(i) & 31;
  for (let v of words)
    chk = bech32Polymod(chk) ^ v;
  for (let i = 0;i < 6; i++)
    chk = bech32Polymod(chk);
  chk ^= encodingConst;
  const sum = new Uint8Array(6);
  for (let i = 0;i < 6; i++)
    sum[i] = chk >>> 5 * (5 - i) & 31;
  return BECH_ALPHABET.encode(sum);
}
function genBech32(encoding) {
  const ENCODING_CONST = encoding === "bech32" ? 1 : 734539939;
  const _words = radix2(5);
  const toWords = (from) => {
    abytes3(from);
    const len = from.length;
    const res = new Array(Math.ceil(len * 8 / 5));
    let carry = 0;
    let pos = 0;
    let j = 0;
    for (let i = 0;i < len; i++) {
      carry = carry << 8 | from[i];
      pos += 8;
      for (;pos >= 5; pos -= 5)
        res[j++] = carry >> pos - 5 & 31;
    }
    if (pos > 0)
      res[j] = carry << 5 - pos & 31;
    return res;
  };
  const fromWords = (to) => {
    anumArr("radix2.decode", to);
    const len = to.length;
    const digits = new Uint8Array(len);
    for (let i = 0;i < len; i++) {
      const w = to[i];
      if (w < 0 || w >= 32)
        throw new Error(`convertRadix2: invalid word=${w}`);
      digits[i] = w;
    }
    return _words.decode(digits);
  };
  const fromWordsUnsafe = unsafeWrapper(fromWords);
  function encode(prefix, words, limit = 90) {
    astr("bech32.encode prefix", prefix);
    if (limit !== false)
      anumber3(limit, "limit");
    if (isBytes3(words))
      words = u8ToNumArr(words);
    anumArr("bech32.encode", words);
    const plen = prefix.length;
    if (plen === 0)
      throw new TypeError(`Invalid prefix length ${plen}`);
    const actualLength = plen + 7 + words.length;
    if (limit !== false && actualLength > limit)
      throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    assertBech32Printable("bech32.encode prefix", prefix);
    const lowered = prefix.toLowerCase();
    const sum = bechChecksum(lowered, words, ENCODING_CONST);
    return `${lowered}1${BECH_ALPHABET.encode(wordsToU8(words))}${sum}`;
  }
  function decode(str, limit = 90) {
    astr("bech32.decode input", str);
    if (limit !== false)
      anumber3(limit, "limit");
    const slen = str.length;
    if (slen < 8 || limit !== false && slen > limit)
      throw new TypeError(`invalid string length ${slen}, expected (8..${limit})`);
    const lowered = str.toLowerCase();
    if (str !== lowered) {
      if (!BECH_UPPERCASE_PRINTABLE.test(str)) {
        assertBech32Printable("bech32.decode input", str);
        throw new Error(`mixed-case string not allowed`);
      }
    }
    const sepIndex = lowered.lastIndexOf("1");
    if (sepIndex === 0 || sepIndex === -1)
      throw new Error(`invalid separator "1"`);
    const prefix = lowered.slice(0, sepIndex);
    const data = lowered.slice(sepIndex + 1);
    if (data.length < 6)
      throw new Error("invalid data length");
    const digits = BECH_ALPHABET.decode(data);
    const words = u8ToNumArr(digits, digits.length - 6);
    const sum = bechChecksum(prefix, words, ENCODING_CONST);
    if (!data.endsWith(sum))
      throw new Error(`Invalid checksum in ${str}`);
    return { prefix, words };
  }
  const decodeUnsafe = unsafeWrapper(decode);
  function decodeToBytes(str, limit = 90) {
    const { prefix, words } = decode(str, limit);
    return {
      prefix,
      words,
      bytes: fromWords(words)
    };
  }
  function encodeFromBytes(prefix, bytes) {
    return encode(prefix, toWords(bytes));
  }
  return {
    encode,
    decode,
    encodeFromBytes,
    decodeToBytes,
    decodeUnsafe,
    fromWords,
    fromWordsUnsafe,
    toWords
  };
}
var bech32 = /* @__PURE__ */ freeze(() => genBech32("bech32"));
var bech32m = /* @__PURE__ */ freeze(() => genBech32("bech32m"));
var _isWellFormedShim = (str) => {
  try {
    return encodeURI(str) !== null;
  } catch {
    return false;
  }
};
var _isWellFormed = /* @__PURE__ */ (() => typeof "".isWellFormed === "function" ? (str) => str.isWellFormed() : _isWellFormedShim)();
var utf8err = (i) => new TypeError(`invalid utf8 at byte ${i}`);
var utf8Fallback = /* @__PURE__ */ freeze(() => ({
  encode(data) {
    abytes3(data);
    let res = "";
    for (let i = 0;i < data.length; ) {
      const a = data[i++];
      if (a < 128) {
        res += String.fromCharCode(a);
        continue;
      }
      if (a < 194 || i >= data.length)
        throw utf8err(i - 1);
      const b = data[i++];
      if ((b & 192) !== 128)
        throw utf8err(i - 1);
      let cp = (a & 31) << 6 | b & 63;
      if (a >= 224) {
        if (i >= data.length)
          throw utf8err(i - 1);
        const c = data[i++];
        if ((c & 192) !== 128 || a === 224 && b < 160 || a === 237 && b >= 160)
          throw utf8err(i - 1);
        cp = (a & 15) << 12 | (b & 63) << 6 | c & 63;
        if (a >= 240) {
          if (i >= data.length)
            throw utf8err(i - 1);
          const d = data[i++];
          if (a > 244 || (d & 192) !== 128 || a === 240 && b < 144 || a === 244 && b >= 144)
            throw utf8err(i - 1);
          cp = (a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63;
        }
      }
      if (cp < 65536)
        res += String.fromCharCode(cp);
      else {
        cp -= 65536;
        res += String.fromCharCode((cp >> 10) + 55296, (cp & 1023) + 56320);
      }
    }
    return res;
  },
  decode(str) {
    astr("utf8", str);
    if (!_isWellFormed(str))
      throw new TypeError("utf8 expected well-formed string");
    const res = new Uint8Array(str.length * 3);
    let pos = 0;
    for (let i = 0;i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 128) {
        res[pos++] = c;
        continue;
      }
      if (c >= 55296 && c <= 57343) {
        const d = str.charCodeAt(++i);
        c = 65536 + (c - 55296 << 10) + d - 56320;
      }
      if (c >= 65536) {
        res[pos++] = c >> 18 | 240;
        res[pos++] = c >> 12 & 63 | 128;
      } else if (c >= 2048)
        res[pos++] = c >> 12 | 224;
      else
        res[pos++] = c >> 6 | 192;
      if (c >= 2048)
        res[pos++] = c >> 6 & 63 | 128;
      res[pos++] = c & 63 | 128;
    }
    return res.subarray(0, pos);
  }
}));
var utf8 = /* @__PURE__ */ freeze(() => {
  let _utf8Encoder;
  let _utf8Decoder;
  const utf8Builtin = {
    encode(data) {
      abytes3(data);
      return (_utf8Decoder || (_utf8Decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }))).decode(data);
    },
    decode(str) {
      astr("utf8", str);
      if (!_isWellFormed(str))
        throw new TypeError("utf8 expected well-formed string");
      return (_utf8Encoder || (_utf8Encoder = new TextEncoder)).encode(str);
    }
  };
  return {
    encode: typeof TextDecoder === "function" ? utf8Builtin.encode : utf8Fallback.encode,
    decode: typeof TextEncoder === "function" ? utf8Builtin.decode : utf8Fallback.decode
  };
});
var hexFallback = /* @__PURE__ */ freeze(() => chain(radix2(4), alphabet("0123456789abcdef", { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" }), normalize((s) => {
  astr("hex", s);
  if (s.length % 2 !== 0)
    throw new TypeError(`hex.decode: odd-length string (${s.length})`);
  return s;
})));
var hasHexBuiltin2 = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")();
var hexBuiltin = {
  encode(data) {
    abytes3(data);
    return data.toHex();
  },
  decode(s) {
    astr("hex", s);
    return Uint8Array.fromHex(s);
  }
};
var hex = /* @__PURE__ */ freeze(() => hasHexBuiltin2 ? hexBuiltin : hexFallback);

// node_modules/@scure/bip32/index.js
/*! scure-bip32 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
var Point = /* @__PURE__ */ (() => secp256k1.Point)();
var Fn = /* @__PURE__ */ (() => Point.Fn)();
var base58check2 = /* @__PURE__ */ createBase58check(sha256);
var MASTER_SECRET = /* @__PURE__ */ (() => {
  return Uint8Array.from("Bitcoin seed".split(""), (char) => char.charCodeAt(0));
})();
var BITCOIN_VERSIONS = { private: 76066276, public: 76067358 };
var HARDENED_OFFSET = 2147483648;
var MAX_DEPTH = 255;
var hash160 = (data) => ripemd160(sha256(data));
var fromU32 = (data) => createView(data).getUint32(0, false);
var toU32 = (n, title = "number") => {
  if (typeof n !== "number")
    throw new TypeError(`"${title}" expected number, got type=${typeof n}`);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 32 - 1)
    throw new RangeError(`"${title}" expected integer in range 0..2**32-1, got ${n}`);
  const buf = new Uint8Array(4);
  createView(buf).setUint32(0, n, false);
  return buf;
};
var validateVersions = (versions, title = "versions") => {
  if (!(typeof versions === "object" && versions !== null))
    throw new Error("versions must be an object");
  toU32(versions.private, `${title}.private`);
  toU32(versions.public, `${title}.public`);
  return versions;
};

class HDKey {
  get fingerprint() {
    if (!this._pubHash) {
      throw new Error("No publicKey set!");
    }
    return fromU32(this._pubHash);
  }
  get identifier() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : undefined;
  }
  get pubKeyHash() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : undefined;
  }
  get privateKey() {
    return this._privateKey ? Uint8Array.from(this._privateKey) : null;
  }
  get publicKey() {
    return this._publicKey ? Uint8Array.from(this._publicKey) : null;
  }
  get chainCode() {
    return this._chainCode ? Uint8Array.from(this._chainCode) : null;
  }
  get privateExtendedKey() {
    const priv = this._privateKey;
    if (!priv) {
      throw new Error("No private key");
    }
    return base58check2.encode(this.serialize(this.versions.private, concatBytes(Uint8Array.of(0), priv)));
  }
  get publicExtendedKey() {
    if (!this._publicKey) {
      throw new Error("No public key");
    }
    return base58check2.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(seed, versions = BITCOIN_VERSIONS) {
    abytes(seed);
    versions = validateVersions(versions);
    if (8 * seed.length < 128 || 8 * seed.length > 512) {
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + seed.length);
    }
    const I = hmac(sha512, MASTER_SECRET, seed);
    const privateKey = I.slice(0, 32);
    const chainCode = I.slice(32);
    return new HDKey({ versions, chainCode, privateKey });
  }
  static fromExtendedKey(base58key, versions = BITCOIN_VERSIONS) {
    versions = validateVersions(versions);
    const keyBuffer = base58check2.decode(base58key);
    if (keyBuffer.length !== 78) {
      throw new Error(`HDKey: invalid extended key length: expected 78 bytes, got ${keyBuffer.length}`);
    }
    const keyView = createView(keyBuffer);
    const version = keyView.getUint32(0, false);
    const opt = {
      versions,
      depth: keyBuffer[4],
      parentFingerprint: keyView.getUint32(5, false),
      index: keyView.getUint32(9, false),
      chainCode: keyBuffer.slice(13, 45)
    };
    const key = keyBuffer.slice(45);
    const isPriv = key[0] === 0;
    if (version !== versions[isPriv ? "private" : "public"]) {
      throw new Error("Version mismatch");
    }
    if (isPriv) {
      return new HDKey({ ...opt, privateKey: key.slice(1) });
    } else {
      return new HDKey({ ...opt, publicKey: key });
    }
  }
  static fromJSON(json) {
    return HDKey.fromExtendedKey("xpriv" in json ? json.xpriv : json.xpub);
  }
  versions;
  depth = 0;
  index = 0;
  parentFingerprint = 0;
  _chainCode = null;
  _privateKey;
  _publicKey;
  _pubHash;
  constructor(opt) {
    if (!opt || typeof opt !== "object") {
      throw new Error("HDKey.constructor must not be called directly");
    }
    const depth = opt.depth ?? 0;
    const index = opt.index ?? 0;
    const parentFingerprint = opt.parentFingerprint ?? 0;
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
      throw new RangeError("HDKey: depth must be an integer in range 0..255");
    }
    toU32(index, "index");
    toU32(parentFingerprint, "parentFingerprint");
    if (depth === 0 && (index !== 0 || parentFingerprint !== 0)) {
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    }
    this.versions = opt.versions ? validateVersions(opt.versions) : BITCOIN_VERSIONS;
    this.depth = depth;
    if (opt.chainCode)
      abytes(opt.chainCode, 32);
    this._chainCode = opt.chainCode ? Uint8Array.from(opt.chainCode) : null;
    this.index = index;
    this.parentFingerprint = parentFingerprint;
    if (opt.publicKey && opt.privateKey) {
      throw new Error("HDKey: publicKey and privateKey at same time.");
    }
    if (opt.privateKey) {
      if (!secp256k1.utils.isValidSecretKey(opt.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(opt.privateKey);
      this._publicKey = secp256k1.getPublicKey(this._privateKey, true);
    } else if (opt.publicKey) {
      this._publicKey = Point.fromBytes(opt.publicKey).toBytes(true);
    } else {
      throw new Error("HDKey: no public or private key provided");
    }
    this._pubHash = hash160(this._publicKey);
  }
  derive(path) {
    if (!/^[mM]'?/.test(path)) {
      throw new Error('Path must start with "m" or "M"');
    }
    if (/^[mM]'?$/.test(path)) {
      return this;
    }
    const parts = path.replace(/^[mM]'?\//, "").split("/");
    if (parts.length > MAX_DEPTH - this.depth) {
      throw new Error("HDKey: path exceeds the serializable depth 255");
    }
    let child = this;
    for (const c of parts) {
      const m = /^(\d+)('?)$/.exec(c);
      const m1 = m && m[1];
      if (!m || m.length !== 3 || typeof m1 !== "string")
        throw new Error("invalid child index: " + c);
      let idx = +m1;
      if (!Number.isSafeInteger(idx) || idx >= HARDENED_OFFSET) {
        throw new Error("Invalid index");
      }
      if (m[2] === "'") {
        idx += HARDENED_OFFSET;
      }
      child = child.deriveChild(idx);
    }
    return child;
  }
  deriveChild(index) {
    return this._deriveChild(index);
  }
  _deriveChild(index, _I) {
    if (!this._publicKey || !this._chainCode) {
      throw new Error("No publicKey or chainCode set");
    }
    let data = toU32(index, "index");
    if (index >= HARDENED_OFFSET) {
      const priv = this._privateKey;
      if (!priv) {
        throw new Error("Could not derive hardened child key");
      }
      data = concatBytes(Uint8Array.of(0), priv, data);
    } else {
      data = concatBytes(this._publicKey, data);
    }
    const out = _I || hmac(sha512, this._chainCode, data);
    abytes(out, 64);
    const childTweak = out.slice(0, 32);
    const chainCode = out.slice(32);
    const opt = {
      versions: this.versions,
      chainCode,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index
    };
    if (opt.depth > MAX_DEPTH) {
      throw new Error("HDKey: depth exceeds the serializable value 255");
    }
    const retry = () => {
      const maxIndex = this._privateKey ? 2 ** 32 - 1 : HARDENED_OFFSET - 1;
      if (index >= maxIndex) {
        throw new Error(`HDKey: cannot retry child derivation at index ${index}`);
      }
      return this.deriveChild(index + 1);
    };
    const ctweak = Fn.fromBytes(childTweak, true);
    if (!Fn.isValid(ctweak))
      return retry();
    if (this._privateKey) {
      const added = Fn.create(Fn.fromBytes(this._privateKey) + ctweak);
      if (!Fn.isValidNot0(added))
        return retry();
      opt.privateKey = Fn.toBytes(added);
    } else {
      const point = Point.fromBytes(this._publicKey);
      const added = ctweak === 0n ? point : point.add(Point.BASE.multiply(ctweak));
      if (added.equals(Point.ZERO))
        return retry();
      opt.publicKey = added.toBytes(true);
    }
    return new HDKey(opt);
  }
  sign(hash) {
    if (!this._privateKey) {
      throw new Error("No privateKey set!");
    }
    abytes(hash, 32);
    return secp256k1.sign(hash, this._privateKey, { prehash: false });
  }
  verify(hash, signature) {
    abytes(hash, 32);
    abytes(signature, 64);
    if (!this._publicKey) {
      throw new Error("No publicKey set!");
    }
    return secp256k1.verify(signature, hash, this._publicKey, { prehash: false });
  }
  wipePrivateData() {
    if (this._privateKey) {
      this._privateKey.fill(0);
      this._privateKey = undefined;
    }
    return this;
  }
  toJSON() {
    return this.toPrivateJSON();
  }
  toPrivateJSON() {
    return {
      xpriv: this.privateExtendedKey,
      xpub: this.publicExtendedKey
    };
  }
  serialize(version, key) {
    if (!this._chainCode) {
      throw new Error("No chainCode set");
    }
    abytes(key, 33);
    return concatBytes(toU32(version, "version"), new Uint8Array([this.depth]), toU32(this.parentFingerprint, "parentFingerprint"), toU32(this.index, "index"), this._chainCode, key);
  }
}

// node_modules/micro-packed/index.js
var EMPTY = /* @__PURE__ */ Uint8Array.of();
var NULL = /* @__PURE__ */ Uint8Array.of(0);
var restrictedKeys = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var validateFieldName = (name, label) => {
  if (typeof name !== "string")
    throw new Error(`${label} should be string, got ${typeof name}`);
  if (name.includes(".."))
    throw new TypeError(`${label} ${name} cannot contain path parent ..`);
  if (name.includes("/"))
    throw new TypeError(`${label} ${name} cannot contain path separator /`);
  if (restrictedKeys.has(name))
    throw new Error(`${label} ${name} is reserved`);
};
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  for (let i = 0;i < a.length; i++)
    if (a[i] !== b[i])
      return false;
  return true;
}
function createFindBytes(needle) {
  if (needle.length === 1) {
    const byte = needle[0];
    return (data, pos = 0) => {
      const idx = data.indexOf(byte, pos);
      return idx === -1 ? undefined : idx;
    };
  }
  const back = new Uint32Array(needle.length);
  for (let i = 1, j = 0;i < needle.length; i++) {
    while (j && needle[i] !== needle[j])
      j = back[j - 1];
    if (needle[i] === needle[j])
      back[i] = ++j;
  }
  return (data, pos = 0) => {
    for (let i = pos, j = 0;i < data.length; i++) {
      while (j && data[i] !== needle[j])
        j = back[j - 1];
      if (data[i] !== needle[j])
        continue;
      if (++j === needle.length)
        return i - needle.length + 1;
    }
    return;
  };
}
var findBytes = (needle, data, pos = 0) => createFindBytes(needle)(data, pos);
function equal(a, b) {
  const aBytes = isBytes4(a);
  const bBytes = isBytes4(b);
  if (aBytes || bBytes)
    return aBytes && bBytes && equalBytes(a, b);
  return a === b;
}
function isBytes4(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function concatBytes3(...arrays) {
  let sum = 0;
  for (let i = 0;i < arrays.length; i++) {
    const a = arrays[i];
    if (!isBytes4(a))
      throw new Error("Uint8Array expected");
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0;i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
var createView2 = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
var _0n7 = /* @__PURE__ */ BigInt(0);
var _1n5 = /* @__PURE__ */ BigInt(1);
var _2n4 = /* @__PURE__ */ BigInt(2);
var _8n2 = /* @__PURE__ */ BigInt(8);
var _10n = /* @__PURE__ */ BigInt(10);
var _255n = /* @__PURE__ */ BigInt(255);
function isPlainObject(obj) {
  return Object.prototype.toString.call(obj) === "[object Object]";
}
function isNum(num) {
  return Number.isSafeInteger(num);
}
var hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
var utils = /* @__PURE__ */ Object.freeze({
  equalBytes,
  isBytes: isBytes4,
  isCoder,
  checkBounds,
  concatBytes: concatBytes3,
  createView: createView2,
  isPlainObject
});
var lengthCoder = (len) => {
  if (len !== null && typeof len !== "string" && !isCoder(len) && !isBytes4(len) && !isNum(len)) {
    throw new TypeError(`lengthCoder: expected null | number | Uint8Array | CoderType, got ${len} (${typeof len})`);
  }
  if (typeof len === "number" && len < 0)
    throw new Error(`lengthCoder: wrong length=${len}`);
  if (isBytes4(len) && !len.length)
    throw new Error("lengthCoder: empty terminator");
  return {
    encodeStream(w, value) {
      if (len === null)
        return;
      if (isCoder(len))
        return len.encodeStream(w, value);
      let byteLen;
      if (typeof len === "number")
        byteLen = len;
      else if (typeof len === "string")
        byteLen = Path.resolve(w.stack, len);
      if (typeof byteLen === "bigint")
        byteLen = Number(byteLen);
      if (!isNum(byteLen) || byteLen < 0 || byteLen !== value)
        throw w.err(`Wrong length: ${byteLen} len=${len} exp=${value} (${typeof value})`);
    },
    decodeStream(r) {
      let byteLen;
      if (isCoder(len))
        byteLen = len.decodeStream(r);
      else if (typeof len === "number")
        byteLen = len;
      else if (typeof len === "string")
        byteLen = Path.resolve(r.stack, len);
      if (typeof byteLen === "bigint")
        byteLen = Number(byteLen);
      else if (typeof byteLen !== "number")
        throw r.err(`Wrong length: ${byteLen}`);
      if (!isNum(byteLen) || byteLen < 0)
        throw r.err(`Wrong length: ${byteLen}`);
      return byteLen;
    }
  };
};
var Bitset = /* @__PURE__ */ Object.freeze({
  BITS: 32,
  FULL_MASK: -1 >>> 0,
  len: (len) => {
    if (!isNum(len) || len < 0)
      throw new Error(`wrong len=${len}`);
    return Math.ceil(len / 32);
  },
  create: (len) => new Uint32Array(Bitset.len(len)),
  clean: (bs) => bs.fill(0),
  debug: (bs) => Array.from(bs).map((i) => (i >>> 0).toString(2).padStart(32, "0")),
  checkLen: (bs, len) => {
    if (Bitset.len(len) === bs.length)
      return;
    throw new Error(`wrong length=${bs.length}. Expected: ${Bitset.len(len)}`);
  },
  chunkLen: (bsLen, pos, len) => {
    if (!isNum(bsLen) || bsLen < 0)
      throw new Error(`wrong bsLen=${bsLen}`);
    if (!isNum(pos) || pos < 0)
      throw new Error(`wrong pos=${pos}`);
    if (!isNum(len) || len < 0)
      throw new Error(`wrong len=${len}`);
    if (pos > bsLen - len)
      throw new Error(`wrong range=${pos}/${len} of ${bsLen}`);
  },
  set: (bs, chunk, value, allowRewrite = true) => {
    if (!isNum(chunk) || chunk < 0 || chunk >= bs.length)
      return false;
    if (!allowRewrite && (bs[chunk] & value) !== 0)
      return false;
    bs[chunk] |= value;
    return true;
  },
  pos: (pos, i) => ({
    chunk: Math.floor((pos + i) / 32),
    mask: 1 << 32 - (pos + i) % 32 - 1
  }),
  indices: (bs, len, invert = false) => {
    Bitset.checkLen(bs, len);
    const { FULL_MASK, BITS } = Bitset;
    const left = BITS - len % BITS;
    const lastMask = left ? FULL_MASK >>> left << left : FULL_MASK;
    const res = [];
    for (let i = 0;i < bs.length; i++) {
      let c = bs[i];
      if (invert)
        c = ~c;
      if (i === bs.length - 1)
        c &= lastMask;
      if (c === 0)
        continue;
      for (let j = 0;j < BITS; j++) {
        const m = 1 << BITS - j - 1;
        if (c & m)
          res.push(i * BITS + j);
      }
    }
    return res;
  },
  range: (arr) => {
    const res = [];
    let cur;
    for (const i of arr) {
      if (cur === undefined || i !== cur.pos + cur.length)
        res.push(cur = { pos: i, length: 1 });
      else
        cur.length += 1;
    }
    return res;
  },
  rangeDebug: (bs, len, invert = false) => `[${Bitset.range(Bitset.indices(bs, len, invert)).map((i) => `(${i.pos}/${i.length})`).join(", ")}]`,
  setRange: (bs, bsLen, pos, len, allowRewrite = true) => {
    Bitset.chunkLen(bsLen, pos, len);
    if (len === 0)
      return true;
    const { FULL_MASK, BITS } = Bitset;
    const first = pos % BITS ? Math.floor(pos / BITS) : undefined;
    const lastPos = pos + len;
    const last = lastPos % BITS ? Math.floor(lastPos / BITS) : undefined;
    const canSet = (chunk, value) => chunk >= 0 && chunk < bs.length && (bs[chunk] & value) === 0;
    if (!allowRewrite) {
      if (first !== undefined && first === last) {
        if (!canSet(first, FULL_MASK >>> BITS - len << BITS - len - pos))
          return false;
      } else {
        if (first !== undefined && !canSet(first, FULL_MASK >>> pos % BITS))
          return false;
        const start = first !== undefined ? first + 1 : pos / BITS;
        const end = last !== undefined ? last : lastPos / BITS;
        for (let i = start;i < end; i++)
          if (!canSet(i, FULL_MASK))
            return false;
        if (last !== undefined && first !== last) {
          if (!canSet(last, FULL_MASK << BITS - lastPos % BITS))
            return false;
        }
      }
    }
    if (first !== undefined && first === last)
      return Bitset.set(bs, first, FULL_MASK >>> BITS - len << BITS - len - pos, allowRewrite);
    if (first !== undefined) {
      if (!Bitset.set(bs, first, FULL_MASK >>> pos % BITS, allowRewrite))
        return false;
    }
    const start = first !== undefined ? first + 1 : pos / BITS;
    const end = last !== undefined ? last : lastPos / BITS;
    for (let i = start;i < end; i++)
      if (!Bitset.set(bs, i, FULL_MASK, allowRewrite))
        return false;
    if (last !== undefined && first !== last) {
      if (!Bitset.set(bs, last, FULL_MASK << BITS - lastPos % BITS, allowRewrite))
        return false;
    }
    return true;
  }
});
var Path = /* @__PURE__ */ Object.freeze({
  pushObj: (stack, obj, objFn) => {
    stack.push({ obj });
    objFn();
    stack.pop();
  },
  path: (stack) => {
    const res = [];
    for (const i of stack)
      if (i.field !== undefined)
        res.push(i.field === "" ? '""' : `${i.field}`);
    return res.join("/");
  },
  err: (name, stack, msg) => {
    const text = `${name}(${Path.path(stack)}): ${typeof msg === "string" ? msg : msg.message}`;
    const err = msg instanceof TypeError ? new TypeError(text) : msg instanceof RangeError ? new RangeError(text) : new Error(text);
    if (msg instanceof Error && msg.stack) {
      const from = `${msg.name}: ${msg.message}`;
      const to = `${err.name}: ${err.message}`;
      err.stack = msg.stack.startsWith(from) ? `${to}${msg.stack.slice(from.length)}` : msg.stack;
    }
    return err;
  },
  resolve: (stack, path) => {
    const parts = path.split("/");
    const objPath = stack.map((i) => i.obj);
    let i = 0;
    for (;i < parts.length; i++) {
      if (parts[i] === "..")
        objPath.pop();
      else
        break;
    }
    let cur = objPath.pop();
    for (;i < parts.length; i++) {
      if (!cur || cur[parts[i]] === undefined)
        return;
      cur = cur[parts[i]];
    }
    return cur;
  }
});

class _Reader {
  pos = 0;
  data;
  opts;
  stack;
  parent;
  parentOffset;
  bitBuf = 0;
  bitPos = 0;
  bs;
  view;
  constructor(data, opts = {}, stack = [], parent = undefined, parentOffset = 0) {
    if (!isBytes4(data))
      throw new TypeError(`Reader: expected Uint8Array, got ${typeof data}`);
    if (!isPlainObject(opts))
      throw new TypeError(`ReaderOpts: expected plain object, got ${opts}`);
    if (opts.allowUnreadBytes !== undefined && typeof opts.allowUnreadBytes !== "boolean")
      throw new TypeError(`ReaderOpts.allowUnreadBytes: expected boolean, got ${typeof opts.allowUnreadBytes}`);
    if (opts.allowMultipleReads !== undefined && typeof opts.allowMultipleReads !== "boolean")
      throw new TypeError(`ReaderOpts.allowMultipleReads: expected boolean, got ${typeof opts.allowMultipleReads}`);
    this.data = data;
    this.opts = opts;
    this.stack = stack;
    this.parent = parent;
    this.parentOffset = parentOffset;
    this.view = createView2(data);
  }
  _enablePointers() {
    if (this.parent)
      return this.parent._enablePointers();
    if (this.bs)
      return;
    this.bs = Bitset.create(this.data.length);
    Bitset.setRange(this.bs, this.data.length, 0, this.pos, this.opts.allowMultipleReads);
  }
  markBytesBS(pos, len) {
    if (this.parent)
      return this.parent.markBytesBS(this.parentOffset + pos, len);
    if (!len)
      return true;
    if (!this.bs)
      return true;
    return Bitset.setRange(this.bs, this.data.length, pos, len, false);
  }
  markBytes(len) {
    const pos = this.pos;
    const res = this.markBytesBS(pos, len);
    if (!this.opts.allowMultipleReads && !res)
      throw this.err(`multiple read pos=${pos} len=${len}`);
    this.pos += len;
    return res;
  }
  pushObj(obj, objFn) {
    return Path.pushObj(this.stack, obj, objFn);
  }
  enterField(field) {
    const last = this.stack[this.stack.length - 1];
    if (last === undefined || last.field !== undefined)
      throw this.err(`enterField: invalid stack state, field=${field}`);
    last.field = field;
  }
  exitField() {
    this.stack[this.stack.length - 1].field = undefined;
  }
  readView(n, fn) {
    if (!isNum(n) || n < 0)
      throw this.err(`readView: wrong length=${n}`);
    if (this.pos + n > this.data.length)
      throw this.err("readView: Unexpected end of buffer");
    const res = fn(this.view, this.pos);
    this.markBytes(n);
    return res;
  }
  absBytes(n) {
    if (!isNum(n) || n < 0 || n > this.data.length)
      throw new Error("Unexpected end of buffer");
    return this.data.subarray(n);
  }
  finish() {
    if (this.opts.allowUnreadBytes)
      return;
    if (this.bitPos) {
      throw this.err(`${this.bitPos} bits left after unpack: ${hex.encode(this.data.subarray(this.pos))}`);
    }
    if (this.bs && !this.parent) {
      const notRead = Bitset.indices(this.bs, this.data.length, true);
      if (notRead.length) {
        const formatted = Bitset.range(notRead).map(({ pos, length }) => `(${pos}/${length})[${hex.encode(this.data.subarray(pos, pos + length))}]`).join(", ");
        throw this.err(`unread byte ranges: ${formatted} (total=${this.data.length})`);
      } else
        return;
    }
    if (!this.isEnd()) {
      throw this.err(`${this.leftBytes} bytes ${this.bitPos} bits left after unpack: ${hex.encode(this.data.subarray(this.pos))}`);
    }
  }
  err(msg) {
    return Path.err("Reader", this.stack, msg);
  }
  offsetReader(n) {
    if (!isNum(n) || n < 0 || n > this.data.length)
      throw this.err("offsetReader: Unexpected end of buffer");
    return new _Reader(this.absBytes(n), this.opts, this.stack, this, n);
  }
  bytes(n, peek = false) {
    if (this.bitPos)
      throw this.err("readBytes: bitPos not empty");
    if (!isNum(n) || n < 0)
      throw this.err(`readBytes: wrong length=${n}`);
    if (this.pos + n > this.data.length)
      throw this.err("readBytes: Unexpected end of buffer");
    const slice = this.data.subarray(this.pos, this.pos + n);
    if (!peek)
      this.markBytes(n);
    return slice;
  }
  byte(peek = false) {
    if (this.bitPos)
      throw this.err("readByte: bitPos not empty");
    if (this.pos + 1 > this.data.length)
      throw this.err("readByte: Unexpected end of buffer");
    const data = this.data[this.pos];
    if (!peek)
      this.markBytes(1);
    return data;
  }
  get leftBytes() {
    return this.data.length - this.pos;
  }
  get totalBytes() {
    return this.data.length;
  }
  isEnd() {
    return this.pos >= this.data.length && !this.bitPos;
  }
  progress() {
    return this.pos * 8 - this.bitPos;
  }
  bits(bits) {
    if (!isNum(bits) || bits < 0)
      throw this.err(`BitReader: wrong length=${bits}`);
    if (bits > 32)
      throw this.err("BitReader: cannot read more than 32 bits in single call");
    let out = 0;
    while (bits) {
      if (!this.bitPos) {
        this.bitBuf = this.byte();
        this.bitPos = 8;
      }
      const take = Math.min(bits, this.bitPos);
      this.bitPos -= take;
      out = out << take | this.bitBuf >> this.bitPos & 2 ** take - 1;
      this.bitBuf &= 2 ** this.bitPos - 1;
      bits -= take;
    }
    return out >>> 0;
  }
  find(needle, pos = this.pos) {
    if (!isBytes4(needle))
      throw this.err(`find: needle is not bytes! ${needle}`);
    if (this.bitPos)
      throw this.err("find: bitPos not empty");
    if (!needle.length)
      throw this.err(`find: needle is empty`);
    if (!isNum(pos) || pos < 0)
      throw this.err(`find: wrong pos=${pos}`);
    return findBytes(needle, this.data, pos);
  }
}

class _Writer {
  pos = 0;
  stack;
  buffers = [];
  chunks = [];
  chunk;
  chunkView;
  chunkPos = 0;
  run;
  nextChunkSize = 0;
  ptrs = [];
  bitBuf = 0;
  bitPos = 0;
  finished = false;
  constructor(stack = []) {
    this.stack = stack;
  }
  carve(len) {
    if (this.chunk === undefined || this.chunk.length - this.chunkPos < len) {
      const size = Math.max(len, this.nextChunkSize, 64);
      this.nextChunkSize = Math.min(size * 8, 4096);
      this.chunk = new Uint8Array(size);
      this.chunkView = undefined;
      this.chunkPos = 0;
      this.run = undefined;
      this.chunks.push(this.chunk);
    }
    const pos = this.chunkPos;
    if (this.run === undefined) {
      this.run = { chunk: this.chunk, start: pos, end: pos + len };
      this.buffers.push(this.run);
    } else
      this.run.end += len;
    this.chunkPos = pos + len;
    this.pos += len;
    return pos;
  }
  pushObj(obj, objFn) {
    return Path.pushObj(this.stack, obj, objFn);
  }
  enterField(field) {
    const last = this.stack[this.stack.length - 1];
    if (last === undefined || last.field !== undefined)
      throw this.err(`enterField: invalid stack state, field=${field}`);
    last.field = field;
  }
  exitField() {
    this.stack[this.stack.length - 1].field = undefined;
  }
  writeView(len, fn) {
    if (this.finished)
      throw this.err("buffer: finished");
    if (!isNum(len) || len < 0 || len > 8)
      throw new Error(`wrong writeView length=${len}`);
    if (this.bitPos)
      throw this.err("writeBytes: ends with non-empty bit buffer");
    const pos = this.carve(len);
    if (this.chunkView === undefined)
      this.chunkView = createView2(this.chunk);
    fn(this.chunkView, pos);
  }
  err(msg) {
    return Path.err("Writer", this.stack, msg);
  }
  bytes(b) {
    if (this.finished)
      throw this.err("buffer: finished");
    if (this.bitPos)
      throw this.err("writeBytes: ends with non-empty bit buffer");
    if (!isBytes4(b))
      throw this.err(`writeBytes: expected Uint8Array, got ${typeof b}`);
    this.buffers.push(b);
    this.run = undefined;
    this.pos += b.length;
  }
  byte(b) {
    if (this.finished)
      throw this.err("buffer: finished");
    if (this.bitPos)
      throw this.err("writeByte: ends with non-empty bit buffer");
    if (!isNum(b) || b < 0 || b > 255)
      throw this.err(`writeByte: wrong value=${b}`);
    const pos = this.carve(1);
    this.chunk[pos] = b;
  }
  finish(clean = true) {
    if (this.finished)
      throw this.err("buffer: finished");
    if (this.bitPos)
      throw this.err("buffer: ends with non-empty bit buffer");
    const buffers = this.buffers;
    let sum = 0;
    for (let i = 0;i < buffers.length; i++) {
      const b = buffers[i];
      sum += isBytes4(b) ? b.length : b.end - b.start;
    }
    for (let i = 0;i < this.ptrs.length; i++)
      sum += this.ptrs[i].buffer.length;
    const buf = new Uint8Array(sum);
    let pad = 0;
    for (let i = 0;i < buffers.length; i++) {
      const b = buffers[i];
      if (isBytes4(b)) {
        buf.set(b, pad);
        pad += b.length;
      } else {
        buf.set(b.chunk.subarray(b.start, b.end), pad);
        pad += b.end - b.start;
      }
    }
    for (let i = 0;i < this.ptrs.length; i++) {
      buf.set(this.ptrs[i].buffer, pad);
      pad += this.ptrs[i].buffer.length;
    }
    for (let pos = this.pos, i = 0;i < this.ptrs.length; i++) {
      const ptr = this.ptrs[i];
      buf.set(ptr.ptr.encode(pos), ptr.pos);
      pos += ptr.buffer.length;
    }
    if (clean) {
      for (const c of this.chunks)
        c.fill(0);
      this.chunks = [];
      this.chunk = undefined;
      this.chunkView = undefined;
      this.chunkPos = 0;
      this.run = undefined;
      this.buffers = [];
      for (const p of this.ptrs)
        p.buffer.fill(0);
      this.ptrs = [];
      this.finished = true;
      this.bitBuf = 0;
    }
    return buf;
  }
  bits(value, bits) {
    if (this.finished)
      throw this.err("buffer: finished");
    if (!isNum(bits) || bits < 0)
      throw this.err(`writeBits: wrong length=${bits}`);
    if (bits > 32)
      throw this.err("writeBits: cannot write more than 32 bits in single call");
    if (!isNum(value) || value < 0)
      throw this.err(`writeBits: wrong value=${value}`);
    if (value >= 2 ** bits)
      throw this.err(`writeBits: value (${value}) >= 2**bits (${bits})`);
    while (bits) {
      const take = Math.min(bits, 8 - this.bitPos);
      this.bitBuf = this.bitBuf << take | value >> bits - take;
      this.bitPos += take;
      bits -= take;
      value &= 2 ** bits - 1;
      if (this.bitPos === 8) {
        this.bitPos = 0;
        const pos = this.carve(1);
        this.chunk[pos] = this.bitBuf;
      }
    }
  }
}
var swapEndianness = (b) => Uint8Array.from(b).reverse();
function checkMinimalBigintBytes(value, le, signed, err) {
  if (!value.length)
    return;
  const b = le ? swapEndianness(value) : value;
  const fail = () => {
    throw err("bigint: non-minimal encoding");
  };
  if (!signed) {
    if (b[0] === 0)
      fail();
    return;
  }
  if (b[0] === 0 && (b.length === 1 || (b[1] & 128) === 0))
    fail();
  if (b.length > 1 && b[0] === 255 && (b[1] & 128) !== 0)
    fail();
}
function checkBounds(value, bits, signed) {
  if (signed) {
    if (bits <= _0n7)
      throw new Error(`checkBounds: signed bits must be positive, got ${bits}`);
    const signBit = _2n4 ** (bits - _1n5);
    if (value < -signBit || value >= signBit)
      throw new Error(`value out of signed bounds. Expected ${-signBit} <= ${value} < ${signBit}`);
  } else {
    const max = _2n4 ** bits;
    if (_0n7 > value || value >= max)
      throw new Error(`value out of unsigned bounds. Expected 0 <= ${value} < ${max}`);
  }
}
function _wrap(inner) {
  const _inner = inner;
  return {
    encodeStream: _inner.encodeStream,
    decodeStream: _inner.decodeStream,
    size: _inner.size,
    encode: (value) => {
      const w = new _Writer;
      _inner.encodeStream(w, value);
      return w.finish();
    },
    decode: (data, opts = {}) => {
      if (!isBytes4(data))
        throw new TypeError(`decode: expected Uint8Array, got ${typeof data}`);
      const r = new _Reader(data, opts);
      const res = _inner.decodeStream(r);
      r.finish();
      return res;
    }
  };
}
function validate(inner, fn) {
  if (!isCoder(inner))
    throw new TypeError(`validate: invalid inner value ${inner}`);
  if (typeof fn !== "function")
    throw new TypeError("validate: fn should be function");
  return _wrap({
    size: inner.size,
    encodeStream: (w, value) => {
      let res;
      try {
        res = fn(value);
      } catch (e) {
        throw w.err(e);
      }
      inner.encodeStream(w, res);
    },
    decodeStream: (r) => {
      const res = inner.decodeStream(r);
      try {
        return fn(res);
      } catch (e) {
        throw r.err(e);
      }
    }
  });
}
var wrap = (inner) => {
  const _inner = inner;
  if (!isPlainObject(_inner))
    throw new TypeError(`wrap: invalid inner value ${_inner}`);
  if (typeof _inner.encodeStream !== "function")
    throw new TypeError("wrap: encodeStream should be function");
  if (typeof _inner.decodeStream !== "function")
    throw new TypeError("wrap: decodeStream should be function");
  if (_inner.size !== undefined && (!isNum(_inner.size) || _inner.size < 0))
    throw new TypeError(`wrap: invalid size ${_inner.size}`);
  if (_inner.validate !== undefined && typeof _inner.validate !== "function")
    throw new TypeError("wrap: validate should be function");
  const res = _wrap(_inner);
  return _inner.validate !== undefined ? validate(res, _inner.validate) : res;
};
var isBaseCoder = (elm) => isPlainObject(elm) && typeof elm.decode === "function" && typeof elm.encode === "function";
function isCoder(elm) {
  return isPlainObject(elm) && isBaseCoder(elm) && typeof elm.encodeStream === "function" && typeof elm.decodeStream === "function" && (elm.size === undefined || isNum(elm.size) && elm.size >= 0);
}
function dict() {
  return {
    encode: (from) => {
      if (!Array.isArray(from))
        throw new Error("array expected");
      const to = {};
      const seen = new Set;
      for (const item of from) {
        if (!Array.isArray(item) || item.length !== 2)
          throw new Error(`array of two elements expected`);
        const name = item[0];
        const value = item[1];
        validateFieldName(name, "dict: key");
        if (seen.has(name))
          throw new Error(`key(${name}) appears twice in struct`);
        seen.add(name);
        to[name] = value;
      }
      return to;
    },
    decode: (to) => {
      if (!isPlainObject(to))
        throw new Error(`expected plain object, got ${to}`);
      for (const name in to)
        validateFieldName(name, "dict: key");
      return Object.entries(to);
    }
  };
}
var numberBigint = /* @__PURE__ */ Object.freeze({
  encode: (from) => {
    if (typeof from !== "bigint")
      throw new Error(`expected bigint, got ${typeof from}`);
    if (from > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(`element bigger than MAX_SAFE_INTEGER=${from}`);
    if (from < BigInt(Number.MIN_SAFE_INTEGER))
      throw new Error(`element smaller than MIN_SAFE_INTEGER=${from}`);
    return Number(from);
  },
  decode: (to) => {
    if (!isNum(to))
      throw new Error("element is not a safe integer");
    return BigInt(to);
  }
});
function tsEnum(e) {
  if (!isPlainObject(e))
    throw new Error("plain object expected");
  return {
    encode: (from) => {
      if (!isNum(from) || !(from in e))
        throw new Error(`wrong value ${from}`);
      return e[from];
    },
    decode: (to) => {
      if (typeof to !== "string")
        throw new Error(`wrong value ${typeof to}`);
      const value = e[to];
      if (!hasOwn(e, to) || !isNum(value))
        throw new Error(`wrong value ${to}`);
      return value;
    }
  };
}
function decimal(precision, round = false) {
  if (!isNum(precision) || precision < 0)
    throw new Error(`decimal/precision: wrong value ${precision}`);
  if (typeof round !== "boolean")
    throw new Error(`decimal/round: expected boolean, got ${typeof round}`);
  const decimalMask = _10n ** BigInt(precision);
  return {
    encode: (from) => {
      if (typeof from !== "bigint")
        throw new Error(`expected bigint, got ${typeof from}`);
      let s = (from < _0n7 ? -from : from).toString(10);
      let sep = s.length - precision;
      if (sep < 0) {
        s = s.padStart(s.length - sep, "0");
        sep = 0;
      }
      let i = s.length - 1;
      for (;i >= sep && s[i] === "0"; i--)
        ;
      let int = s.slice(0, sep);
      let frac = s.slice(sep, i + 1);
      if (!int)
        int = "0";
      if (from < _0n7)
        int = "-" + int;
      if (!frac)
        return int;
      return `${int}.${frac}`;
    },
    decode: (to) => {
      if (typeof to !== "string")
        throw new Error(`expected string, got ${typeof to}`);
      let neg = false;
      if (to.startsWith("-")) {
        neg = true;
        to = to.slice(1);
      }
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(to))
        throw new Error(`wrong string value=${to}`);
      let sep = to.indexOf(".");
      sep = sep === -1 ? to.length : sep;
      const intS = to.slice(0, sep);
      const fracS = to.slice(sep + 1).replace(/0+$/, "");
      const int = BigInt(intS) * decimalMask;
      if (!round && fracS.length > precision) {
        throw new Error(`fractional part cannot be represented with this precision (num=${to}, prec=${precision})`);
      }
      const fracLen = Math.min(fracS.length, precision);
      const frac = BigInt(fracS.slice(0, fracLen)) * _10n ** BigInt(precision - fracLen);
      const value = int + frac;
      if (neg && value === _0n7)
        throw new Error(`negative zero is not allowed`);
      return neg ? -value : value;
    }
  };
}
function match(lst) {
  if (!Array.isArray(lst))
    throw new Error(`expected array, got ${typeof lst}`);
  for (const i of lst)
    if (!isBaseCoder(i))
      throw new Error(`wrong base coder ${i}`);
  return {
    encode: (from) => {
      for (const c of lst) {
        let elm;
        try {
          elm = c.encode(from);
        } catch {
          continue;
        }
        if (elm !== undefined)
          return elm;
      }
      throw new Error(`match/encode: cannot find match in ${from}`);
    },
    decode: (to) => {
      for (const c of lst) {
        let elm;
        try {
          elm = c.decode(to);
        } catch {
          continue;
        }
        if (elm !== undefined)
          return elm;
      }
      throw new Error(`match/decode: cannot find match in ${to}`);
    }
  };
}
var reverse = (coder) => {
  if (!isBaseCoder(coder))
    throw new Error("BaseCoder expected");
  return { encode: (to) => coder.decode(to), decode: (from) => coder.encode(from) };
};
var coders = /* @__PURE__ */ Object.freeze({ dict, numberBigint, tsEnum, decimal, match, reverse });
var bigint = (size, le = false, signed = false, sized = true, minimal = false) => {
  if (!isNum(size) || size <= 0)
    throw new Error(`bigint/size: wrong value ${size}`);
  if (typeof le !== "boolean")
    throw new Error(`bigint/le: expected boolean, got ${typeof le}`);
  if (typeof signed !== "boolean")
    throw new Error(`bigint/signed: expected boolean, got ${typeof signed}`);
  if (typeof sized !== "boolean")
    throw new Error(`bigint/sized: expected boolean, got ${typeof sized}`);
  if (typeof minimal !== "boolean")
    throw new Error(`bigint/minimal: expected boolean, got ${typeof minimal}`);
  const bLen = BigInt(size);
  const signBit = _2n4 ** (_8n2 * bLen - _1n5);
  return wrap({
    size: sized ? size : undefined,
    encodeStream: (w, value) => {
      const zero = value === _0n7;
      if (signed && value < 0)
        value = value | signBit;
      let res = new Uint8Array(size);
      for (let i = size - 1;i >= 0; i--) {
        res[i] = Number(value & _255n);
        value >>= _8n2;
      }
      if (!sized) {
        let pos = 0;
        if (signed) {
          for (;pos < res.length - 1; pos++) {
            const next = res[pos + 1];
            if (res[pos] === 0 && (next & 128) === 0)
              continue;
            if (res[pos] === 255 && (next & 128) !== 0)
              continue;
            break;
          }
          res = zero ? res.subarray(res.length) : res.subarray(pos);
        } else {
          for (;pos < res.length; pos++)
            if (res[pos] !== 0)
              break;
          res = res.subarray(pos);
        }
      }
      w.bytes(le ? res.reverse() : res);
    },
    decodeStream: (r) => {
      const value = r.bytes(sized ? size : Math.min(size, r.leftBytes));
      if (!sized && minimal)
        checkMinimalBigintBytes(value, le, signed, (msg) => r.err(msg));
      let res = _0n7;
      if (le)
        for (let i = value.length - 1;i >= 0; i--)
          res = res << _8n2 | BigInt(value[i]);
      else
        for (let i = 0;i < value.length; i++)
          res = res << _8n2 | BigInt(value[i]);
      const sBit = sized || !value.length ? signBit : _2n4 ** (_8n2 * BigInt(value.length) - _1n5);
      if (signed && res & sBit)
        res = (res ^ sBit) - sBit;
      return res;
    },
    validate: (value) => {
      if (typeof value !== "bigint")
        throw new Error(`bigint: invalid value: ${value}`);
      checkBounds(value, _8n2 * bLen, !!signed);
      return value;
    }
  });
};
var U256LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ bigint(32, true));
var U64LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ bigint(8, true));
var I64LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ bigint(8, true, true));
var view = (len, opts) => wrap({
  size: len,
  encodeStream: (w, value) => w.writeView(len, (view, pos) => opts.write(view, pos, value)),
  decodeStream: (r) => r.readView(len, opts.read),
  validate: (value) => {
    if (typeof value !== "number")
      throw new TypeError(`viewCoder: expected number, got ${typeof value}`);
    if (opts.validate)
      opts.validate(value);
    return value;
  }
});
var intView = (len, signed, opts) => {
  const bits = len * 8;
  const signBit = 2 ** (bits - 1);
  const validateSigned = (value) => {
    if (!isNum(value))
      throw new TypeError(`sintView: value is not safe integer: ${value}`);
    if (value < -signBit || value >= signBit) {
      throw new RangeError(`sintView: value out of bounds. Expected ${-signBit} <= ${value} < ${signBit}`);
    }
  };
  const maxVal = 2 ** bits;
  const validateUnsigned = (value) => {
    if (!isNum(value))
      throw new TypeError(`uintView: value is not safe integer: ${value}`);
    if (0 > value || value >= maxVal) {
      throw new RangeError(`uintView: value out of bounds. Expected 0 <= ${value} < ${maxVal}`);
    }
  };
  return view(len, {
    write: opts.write,
    read: opts.read,
    validate: signed ? validateSigned : validateUnsigned
  });
};
var U32LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ intView(4, false, {
  read: (view, pos) => view.getUint32(pos, true),
  write: (view, pos, value) => view.setUint32(pos, value, true)
}));
var U32BE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ intView(4, false, {
  read: (view, pos) => view.getUint32(pos, false),
  write: (view, pos, value) => view.setUint32(pos, value, false)
}));
var I32LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ intView(4, true, {
  read: (view, pos) => view.getInt32(pos, true),
  write: (view, pos, value) => view.setInt32(pos, value, true)
}));
var U16LE = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ intView(2, false, {
  read: (view, pos) => view.getUint16(pos, true),
  write: (view, pos, value) => view.setUint16(pos, value, true)
}));
var U8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ intView(1, false, {
  read: (view, pos) => view.getUint8(pos),
  write: (view, pos, value) => view.setUint8(pos, value)
}));
var createBytes = (len, le = false) => {
  if (typeof le !== "boolean")
    throw new TypeError(`bytes/le: expected boolean, got ${typeof le}`);
  const _length = lengthCoder(len);
  const _isb = isBytes4(len);
  const terminator = _isb ? Uint8Array.from(len) : undefined;
  const findTerminator = terminator && terminator.length ? createFindBytes(terminator) : undefined;
  return wrap({
    size: typeof len === "number" ? len : undefined,
    encodeStream: (w, value) => {
      if (!_isb)
        _length.encodeStream(w, value.length);
      w.bytes(le ? swapEndianness(value) : value);
      if (terminator)
        w.bytes(terminator);
    },
    decodeStream: (r) => {
      let bytes;
      if (terminator) {
        const tPos = r.find(terminator);
        if (tPos === undefined)
          throw r.err(`bytes: cannot find terminator`);
        bytes = r.bytes(tPos - r.pos);
        r.bytes(terminator.length);
      } else {
        bytes = r.bytes(len === null ? r.leftBytes : _length.decodeStream(r));
      }
      return le ? swapEndianness(bytes) : bytes;
    },
    validate: (value) => {
      if (!isBytes4(value))
        throw new TypeError(`bytes: invalid value ${value}`);
      if (findTerminator) {
        const data = le ? swapEndianness(value) : value;
        if (findTerminator(data) !== undefined)
          throw new Error("bytes: value contains terminator");
      }
      return value;
    }
  });
};
function prefix(len, inner) {
  if (!isCoder(inner))
    throw new TypeError(`prefix: invalid inner value ${inner}`);
  return apply(createBytes(len), reverse(inner));
}
var string = (len, le = false) => validate(apply(createBytes(len, le), utf8), (value) => {
  if (typeof value !== "string")
    throw new Error(`expected string, got ${typeof value}`);
  return value;
});
function apply(inner, base) {
  if (!isCoder(inner))
    throw new TypeError(`apply: invalid inner value ${inner}`);
  if (!isBaseCoder(base))
    throw new TypeError(`apply: invalid base value ${base}`);
  return wrap({
    size: inner.size,
    encodeStream: (w, value) => {
      let innerValue;
      try {
        innerValue = base.decode(value);
      } catch (e) {
        throw w.err("" + e);
      }
      return inner.encodeStream(w, innerValue);
    },
    decodeStream: (r) => {
      const innerValue = inner.decodeStream(r);
      try {
        return base.encode(innerValue);
      } catch (e) {
        throw r.err("" + e);
      }
    }
  });
}
var flag = (flagValue, xor = false) => {
  if (!isBytes4(flagValue))
    throw new TypeError(`flag/flagValue: expected Uint8Array, got ${typeof flagValue}`);
  if (flagValue.length === 0)
    throw new Error("flag/flagValue: empty marker");
  if (typeof xor !== "boolean")
    throw new TypeError(`flag/xor: expected boolean, got ${typeof xor}`);
  const marker = Uint8Array.from(flagValue);
  return wrap({
    size: undefined,
    encodeStream: (w, value) => {
      if (!!value !== xor)
        w.bytes(marker);
    },
    decodeStream: (r) => {
      let hasFlag = r.leftBytes >= marker.length;
      if (hasFlag) {
        hasFlag = equalBytes(r.bytes(marker.length, true), marker);
        if (hasFlag)
          r.bytes(marker.length);
      }
      return hasFlag !== xor;
    },
    validate: (value) => {
      if (value !== undefined && typeof value !== "boolean")
        throw new Error(`flag: expected boolean value or undefined, got ${typeof value}`);
      return value;
    }
  });
};
function validateDefaultSlot(r, value, def) {
  const valueObj = value !== null && typeof value === "object" && !isBytes4(value);
  const defObj = def !== null && typeof def === "object" && !isBytes4(def);
  const nan = typeof value === "number" && typeof def === "number" && Number.isNaN(value) && Number.isNaN(def);
  if ((!valueObj || !defObj) && !equal(value, def) && !nan)
    throw r.err(`default: invalid value ${value} !== ${def}`);
}
function flagged(path, inner, def) {
  if (typeof path !== "string" && !isCoder(path))
    throw new TypeError(`flagged: wrong path=${path}`);
  if (!isCoder(inner))
    throw new TypeError(`flagged: invalid inner value ${inner}`);
  const hasDef = def !== undefined;
  return wrap({
    encodeStream: (w, value) => {
      if (typeof path === "string") {
        if (Path.resolve(w.stack, path))
          inner.encodeStream(w, value);
        else if (hasDef)
          inner.encodeStream(w, def);
      } else {
        const present = value !== undefined;
        path.encodeStream(w, present);
        if (present)
          inner.encodeStream(w, value);
        else if (hasDef)
          inner.encodeStream(w, def);
      }
    },
    decodeStream: (r) => {
      let hasFlag = false;
      if (typeof path === "string")
        hasFlag = !!Path.resolve(r.stack, path);
      else
        hasFlag = path.decodeStream(r);
      if (hasFlag)
        return inner.decodeStream(r);
      else if (hasDef)
        validateDefaultSlot(r, inner.decodeStream(r), def);
      return;
    }
  });
}
function magic(inner, constant, check = true) {
  if (!isCoder(inner))
    throw new TypeError(`magic: invalid inner value ${inner}`);
  if (typeof check !== "boolean")
    throw new TypeError(`magic: expected boolean, got ${typeof check}`);
  return wrap({
    size: inner.size,
    encodeStream: (w, _value) => inner.encodeStream(w, constant),
    decodeStream: (r) => {
      const value = inner.decodeStream(r);
      const valueObj = value !== null && typeof value === "object" && !isBytes4(value);
      const constantObj = constant !== null && typeof constant === "object" && !isBytes4(constant);
      const canCompare = !valueObj || !constantObj;
      if (check && canCompare && !equal(value, constant)) {
        throw r.err(`magic: invalid value: ${value} !== ${constant}`);
      }
      return;
    },
    validate: (value) => {
      if (value !== undefined)
        throw new Error(`magic: wrong value=${typeof value}`);
      return value;
    }
  });
}
function sizeof(fields) {
  let size = 0;
  for (const f of fields) {
    if (f.size === undefined)
      return;
    if (!isNum(f.size))
      throw new Error(`sizeof: wrong element size=${f.size}`);
    size += f.size;
  }
  return size;
}
function struct(fields) {
  if (!isPlainObject(fields))
    throw new TypeError(`struct: expected plain object, got ${fields}`);
  const coders = [];
  for (const name in fields) {
    validateFieldName(name, "struct: field");
    if (!isCoder(fields[name]))
      throw new TypeError(`struct: field ${name} is not CoderType`);
    coders.push(fields[name]);
  }
  return wrap({
    size: sizeof(coders),
    encodeStream: (w, value) => {
      const _w = w;
      _w.pushObj(value, () => {
        for (const name in fields) {
          _w.enterField(name);
          fields[name].encodeStream(w, value[name]);
          _w.exitField();
        }
      });
    },
    decodeStream: (r) => {
      const res = {};
      const _r = r;
      _r.pushObj(res, () => {
        for (const name in fields) {
          _r.enterField(name);
          res[name] = fields[name].decodeStream(r);
          _r.exitField();
        }
      });
      return res;
    },
    validate: (value) => {
      if (typeof value !== "object" || value === null)
        throw new Error(`struct: invalid value ${value}`);
      return value;
    }
  });
}
function array(len, inner) {
  if (!isCoder(inner))
    throw new TypeError(`array: invalid inner value ${inner}`);
  const terminator = isBytes4(len) ? Uint8Array.from(len) : undefined;
  const _length = lengthCoder(typeof len === "string" ? `../${len}` : terminator || len);
  if (len === null && inner.size === 0)
    throw new Error("array: null length cannot use zero-size inner");
  if ((isCoder(len) || typeof len === "string") && inner.size === 0)
    throw new Error("array: dynamic length cannot use zero-size inner");
  return wrap({
    size: typeof len === "number" && inner.size !== undefined ? len * inner.size : undefined,
    encodeStream: (w, value) => {
      const _w = w;
      _w.pushObj(value, () => {
        if (!terminator)
          _length.encodeStream(w, value.length);
        for (let i = 0;i < value.length; i++) {
          _w.enterField(i);
          const elm = value[i];
          const startPos = _w.pos;
          inner.encodeStream(w, elm);
          if (terminator && terminator.length <= _w.pos - startPos) {
            const data = _w.finish(false).subarray(startPos, _w.pos);
            if (equalBytes(data.subarray(0, terminator.length), terminator))
              throw _w.err(`array: inner element encoding same as separator. elm=${elm} data=${data}`);
          }
          _w.exitField();
        }
      });
      if (terminator)
        w.bytes(terminator);
    },
    decodeStream: (r) => {
      const res = [];
      const _r = r;
      _r.pushObj(res, () => {
        if (len === null) {
          for (let i = 0;!r.isEnd(); i++) {
            _r.enterField(i);
            const progress = _r.progress();
            res.push(inner.decodeStream(r));
            if (_r.progress() === progress)
              throw r.err("array: inner decoder did not consume input");
            _r.exitField();
            if (inner.size && r.leftBytes < inner.size)
              break;
          }
        } else if (terminator) {
          for (let i = 0;; i++) {
            if (equalBytes(r.bytes(terminator.length, true), terminator)) {
              r.bytes(terminator.length);
              break;
            }
            _r.enterField(i);
            const progress = _r.progress();
            res.push(inner.decodeStream(r));
            if (_r.progress() === progress)
              throw r.err("array: inner decoder did not consume input");
            _r.exitField();
          }
        } else {
          _r.enterField("arrayLen");
          const length = _length.decodeStream(r);
          _r.exitField();
          if (inner.size && length * inner.size > r.leftBytes)
            throw r.err(`array: length=${length} elements of size=${inner.size} exceed ${r.leftBytes} bytes left`);
          for (let i = 0;i < length; i++) {
            _r.enterField(i);
            res.push(inner.decodeStream(r));
            _r.exitField();
          }
        }
      });
      return res;
    },
    validate: (value) => {
      if (!Array.isArray(value))
        throw new Error(`array: invalid value ${value}`);
      return value;
    }
  });
}
// node_modules/@scure/btc-signer/utils.js
function abigint(n, title = "value") {
  if (typeof n !== "bigint")
    throw new TypeError(`"${title}" expected bigint, got type=${typeof n}`);
  if (n < _0n8)
    throw new RangeError(`"${title}" expected non-negative bigint, got ${n}`);
  return n;
}
function aarray2(item, title, inner = () => {}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0;i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
function astring2(value, title = "") {
  if (typeof value !== "string") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected string, got type=" + typeof value);
  }
  return value;
}
function validateObject2(object, fields = {}, optFields = {}, _title = "object") {
  return validateObject(object, fields, optFields);
}
var Point2 = /* @__PURE__ */ (() => secp256k1.Point)();
var Fn2 = /* @__PURE__ */ (() => Point2.Fn)();
var CURVE_ORDER = /* @__PURE__ */ (() => Point2.Fn.ORDER)();
var _0n8 = /* @__PURE__ */ BigInt(0);
var _2n5 = /* @__PURE__ */ BigInt(2);
var hasEven2 = (y) => y % _2n5 === _0n8;
var isBytes5 = /* @__PURE__ */ (() => utils.isBytes)();
var concatBytes4 = /* @__PURE__ */ (() => utils.concatBytes)();
var equalBytes2 = /* @__PURE__ */ (() => utils.equalBytes)();
var sha2562 = /* @__PURE__ */ (() => sha256)();
var hash1602 = (msg) => ripemd160(sha2562(msg));
var sha256x2 = (...msgs) => sha2562(sha2562(concatBytes4(...msgs)));
var randomPrivateKeyBytes = () => schnorr.utils.randomSecretKey();
var pubSchnorr = (priv) => schnorr.getPublicKey(priv);
var pubECDSA = (privateKey, isCompressed) => secp256k1.getPublicKey(privateKey, isCompressed);
var LOW_R_BOUND = /* @__PURE__ */ (() => CURVE_ORDER / _2n5)();
var hasLowR = (sig) => sig.r < LOW_R_BOUND;
function signECDSA(hash, privateKey, lowR = false) {
  abytes2(hash, 32, "hash");
  let sig = secp256k1.Signature.fromBytes(secp256k1.sign(hash, privateKey, { prehash: false }));
  if (lowR && !hasLowR(sig)) {
    const extraEntropy = new Uint8Array(32);
    let counter = 0;
    while (!hasLowR(sig)) {
      extraEntropy.set(U32LE.encode(counter++));
      sig = secp256k1.Signature.fromBytes(secp256k1.sign(hash, privateKey, { prehash: false, extraEntropy }));
      if (counter > 4294967295)
        throw new Error("lowR counter overflow: report the error");
    }
  }
  return sig.toBytes("der");
}
var signSchnorr = (message, secretKey, auxRand) => schnorr.sign(message, secretKey, auxRand);
var tagSchnorr = (tag, ...messages) => schnorr.utils.taggedHash(tag, ...messages);
var PubT = /* @__PURE__ */ (() => Object.freeze({
  ecdsa: 0,
  schnorr: 1
}))();
function validatePubkey(pub, type) {
  const len = pub.length;
  if (type === PubT.ecdsa) {
    if (len === 32)
      throw new RangeError("Expected non-Schnorr key");
    Point2.fromBytes(pub);
    return pub;
  } else if (type === PubT.schnorr) {
    if (len !== 32)
      throw new RangeError("Expected 32-byte Schnorr key");
    schnorr.utils.lift_x(bytesToNumberBE(pub));
    return pub;
  } else {
    throw new TypeError("Unknown key type");
  }
}
function tapTweak(a, b) {
  const u = schnorr.utils;
  const t = u.taggedHash("TapTweak", a, b);
  const tn = bytesToNumberBE(t);
  if (tn >= CURVE_ORDER)
    throw new Error("tweak higher than curve order");
  return tn;
}
function taprootTweakPrivKey(privKey, merkleRoot = Uint8Array.of()) {
  const u = schnorr.utils;
  abytes2(privKey, 32, "privKey");
  const seckey0 = bytesToNumberBE(privKey);
  const P = Point2.BASE.multiply(seckey0);
  const seckey = hasEven2(P.y) ? seckey0 : Fn2.neg(seckey0);
  const xP = u.pointToBytes(P);
  const t = tapTweak(xP, merkleRoot);
  return numberToBytesBE(Fn2.add(seckey, t), 32);
}
function taprootTweakPubkey(pubKey, h) {
  const u = schnorr.utils;
  abytes2(pubKey, 32, "pubKey");
  const t = tapTweak(pubKey, h);
  const P = u.lift_x(bytesToNumberBE(pubKey));
  const Q = P.add(Point2.BASE.multiply(t));
  const parity = hasEven2(Q.y) ? 0 : 1;
  return [u.pointToBytes(Q), parity];
}
var INTERNAL_TAPROOT_NUMS = /* @__PURE__ */ (() => sha2562(Point2.BASE.toBytes(false)))();
function taprootNumsKey() {
  return Uint8Array.from(INTERNAL_TAPROOT_NUMS);
}
var NETWORK = /* @__PURE__ */ Object.freeze({
  bech32: "bc",
  pubKeyHash: 0,
  scriptHash: 5,
  wif: 128
});
var TEST_NETWORK = /* @__PURE__ */ Object.freeze({
  bech32: "tb",
  pubKeyHash: 111,
  scriptHash: 196,
  wif: 239
});
function compareBytes(a, b) {
  if (!isBytes5(a) || !isBytes5(b))
    throw new TypeError(`cmp: wrong type a=${typeof a} b=${typeof b}`);
  const len = Math.min(a.length, b.length);
  for (let i = 0;i < len; i++)
    if (a[i] != b[i])
      return Math.sign(a[i] - b[i]);
  return Math.sign(a.length - b.length);
}
function reverseObject(obj) {
  const res = Object.create(null);
  for (const k in obj) {
    if (res[obj[k]] !== undefined)
      throw new Error("duplicate key");
    res[obj[k]] = k;
  }
  return res;
}

// node_modules/@scure/btc-signer/script.js
var MAX_SCRIPT_BYTE_LENGTH = 520;
var _0n9 = /* @__PURE__ */ BigInt(0);
var _1n6 = /* @__PURE__ */ BigInt(1);
var _2n6 = /* @__PURE__ */ BigInt(2);
var _8n3 = /* @__PURE__ */ BigInt(8);
var U8_MAX = /* @__PURE__ */ BigInt(255);
var COMPACT_DIRECT_MAX = /* @__PURE__ */ BigInt(252);
var OP = /* @__PURE__ */ Object.freeze({
  OP_0: 0,
  PUSHDATA1: 76,
  PUSHDATA2: 77,
  PUSHDATA4: 78,
  "1NEGATE": 79,
  RESERVED: 80,
  OP_1: 81,
  OP_2: 82,
  OP_3: 83,
  OP_4: 84,
  OP_5: 85,
  OP_6: 86,
  OP_7: 87,
  OP_8: 88,
  OP_9: 89,
  OP_10: 90,
  OP_11: 91,
  OP_12: 92,
  OP_13: 93,
  OP_14: 94,
  OP_15: 95,
  OP_16: 96,
  NOP: 97,
  VER: 98,
  IF: 99,
  NOTIF: 100,
  VERIF: 101,
  VERNOTIF: 102,
  ELSE: 103,
  ENDIF: 104,
  VERIFY: 105,
  RETURN: 106,
  TOALTSTACK: 107,
  FROMALTSTACK: 108,
  "2DROP": 109,
  "2DUP": 110,
  "3DUP": 111,
  "2OVER": 112,
  "2ROT": 113,
  "2SWAP": 114,
  IFDUP: 115,
  DEPTH: 116,
  DROP: 117,
  DUP: 118,
  NIP: 119,
  OVER: 120,
  PICK: 121,
  ROLL: 122,
  ROT: 123,
  SWAP: 124,
  TUCK: 125,
  CAT: 126,
  SUBSTR: 127,
  LEFT: 128,
  RIGHT: 129,
  SIZE: 130,
  INVERT: 131,
  AND: 132,
  OR: 133,
  XOR: 134,
  EQUAL: 135,
  EQUALVERIFY: 136,
  RESERVED1: 137,
  RESERVED2: 138,
  "1ADD": 139,
  "1SUB": 140,
  "2MUL": 141,
  "2DIV": 142,
  NEGATE: 143,
  ABS: 144,
  NOT: 145,
  "0NOTEQUAL": 146,
  ADD: 147,
  SUB: 148,
  MUL: 149,
  DIV: 150,
  MOD: 151,
  LSHIFT: 152,
  RSHIFT: 153,
  BOOLAND: 154,
  BOOLOR: 155,
  NUMEQUAL: 156,
  NUMEQUALVERIFY: 157,
  NUMNOTEQUAL: 158,
  LESSTHAN: 159,
  GREATERTHAN: 160,
  LESSTHANOREQUAL: 161,
  GREATERTHANOREQUAL: 162,
  MIN: 163,
  MAX: 164,
  WITHIN: 165,
  RIPEMD160: 166,
  SHA1: 167,
  SHA256: 168,
  HASH160: 169,
  HASH256: 170,
  CODESEPARATOR: 171,
  CHECKSIG: 172,
  CHECKSIGVERIFY: 173,
  CHECKMULTISIG: 174,
  CHECKMULTISIGVERIFY: 175,
  NOP1: 176,
  CHECKLOCKTIMEVERIFY: 177,
  CHECKSEQUENCEVERIFY: 178,
  NOP4: 179,
  NOP5: 180,
  NOP6: 181,
  NOP7: 182,
  NOP8: 183,
  NOP9: 184,
  NOP10: 185,
  CHECKSIGADD: 186,
  INVALID: 255
});
var OPNames = /* @__PURE__ */ (() => Object.freeze(reverseObject(OP)))();
function ScriptNum(bytesLimit = 6, forceMinimal = false) {
  return wrap({
    encodeStream: (w, value) => {
      if (value === _0n9)
        return;
      const neg = value < 0;
      const val = BigInt(value);
      const nums = [];
      for (let abs = neg ? -val : val;abs; abs >>= _8n3)
        nums.push(Number(abs & U8_MAX));
      if (nums[nums.length - 1] >= 128)
        nums.push(neg ? 128 : 0);
      else if (neg)
        nums[nums.length - 1] |= 128;
      w.bytes(new Uint8Array(nums));
    },
    decodeStream: (r) => {
      const len = r.leftBytes;
      if (len > bytesLimit)
        throw new Error(`ScriptNum: number (${len}) bigger than limit=${bytesLimit}`);
      if (len === 0)
        return _0n9;
      const data = r.bytes(len);
      if (forceMinimal) {
        if ((data[len - 1] & 127) === 0) {
          if (len <= 1 || (data[len - 2] & 128) === 0)
            throw new Error("Non-minimally encoded ScriptNum");
        }
      }
      let res = _0n9;
      for (let i = 0;i < len; ++i)
        res |= BigInt(data[i]) << _8n3 * BigInt(i);
      if (data[len - 1] >= 128) {
        res &= _2n6 ** BigInt(len * 8) - _1n6 >> _1n6;
        res = -res;
      }
      return res;
    }
  });
}
function OpToNum(op, bytesLimit = 4, forceMinimal = true) {
  if (typeof op === "number")
    return op;
  if (isBytes5(op)) {
    try {
      const val = ScriptNum(bytesLimit, forceMinimal).decode(op);
      if (val > Number.MAX_SAFE_INTEGER || val < -Number.MAX_SAFE_INTEGER)
        return;
      return Number(val);
    } catch (e) {
      return;
    }
  }
  return;
}
var scriptPushLen = (op, read) => {
  if (!(OP.OP_0 < op && op <= OP.PUSHDATA4))
    return;
  if (op < OP.PUSHDATA1)
    return op;
  if (op === OP.PUSHDATA1)
    return read(1);
  if (op === OP.PUSHDATA2)
    return read(2);
  if (op === OP.PUSHDATA4)
    return read(4);
  throw new Error("Should be not possible");
};
var Script = /* @__PURE__ */ (() => Object.freeze(wrap({
  encodeStream: (w, value) => {
    aarray2(value, "value");
    for (let o of value) {
      if (typeof o === "string") {
        const op = OP[o];
        if (typeof op !== "number")
          throw new Error(`Unknown opcode=${o}`);
        w.byte(op);
        continue;
      } else if (typeof o === "number") {
        if (o === 0) {
          w.byte(0);
          continue;
        } else if (o === -1) {
          w.byte(OP["1NEGATE"]);
          continue;
        } else if (1 <= o && o <= 16) {
          w.byte(OP.OP_1 - 1 + o);
          continue;
        }
      }
      if (typeof o === "number")
        o = ScriptNum().encode(BigInt(o));
      abytes2(o, undefined, "value");
      const len = o.length;
      if (len < OP.PUSHDATA1)
        w.byte(len);
      else if (len <= 255) {
        w.byte(OP.PUSHDATA1);
        w.byte(len);
      } else if (len <= 65535) {
        w.byte(OP.PUSHDATA2);
        w.bytes(U16LE.encode(len));
      } else {
        w.byte(OP.PUSHDATA4);
        w.bytes(U32LE.encode(len));
      }
      w.bytes(o);
    }
  },
  decodeStream: (r) => {
    const out = [];
    while (!r.isEnd()) {
      const cur = r.byte();
      const len = scriptPushLen(cur, (bytes) => {
        if (bytes === 1)
          return U8.decodeStream(r);
        if (bytes === 2)
          return U16LE.decodeStream(r);
        return U32LE.decodeStream(r);
      });
      if (len !== undefined) {
        out.push(r.bytes(len));
      } else if (cur === 0) {
        out.push(0);
      } else if (OP.OP_1 <= cur && cur <= OP.OP_16) {
        out.push(cur - (OP.OP_1 - 1));
      } else {
        const op = OPNames[cur];
        if (op === undefined)
          throw new Error(`Unknown opcode=${cur.toString(16)}`);
        out.push(op);
      }
    }
    return out;
  }
})))();
var CompactSize = /* @__PURE__ */ (() => {
  const limits = {
    253: [253, 2, BigInt(253), BigInt(65535)],
    254: [254, 4, BigInt(65536), BigInt(4294967295)],
    255: [255, 8, BigInt(4294967296), BigInt("0xffffffffffffffff")]
  };
  const limitsList = Object.values(limits);
  return Object.freeze(wrap({
    encodeStream: (w, value) => {
      if (typeof value === "number")
        value = BigInt(value);
      if (_0n9 <= value && value <= COMPACT_DIRECT_MAX)
        return w.byte(Number(value));
      for (const [flag, bytes, start, stop] of limitsList) {
        if (start > value || value > stop)
          continue;
        w.byte(flag);
        for (let i = 0;i < bytes; i++)
          w.byte(Number(value >> _8n3 * BigInt(i) & U8_MAX));
        return;
      }
      throw w.err(`VarInt too big: ${value}`);
    },
    decodeStream: (r) => {
      const b0 = r.byte();
      if (b0 <= 252)
        return BigInt(b0);
      const [_, bytes, start] = limits[b0];
      let num = _0n9;
      for (let i = 0;i < bytes; i++)
        num |= BigInt(r.byte()) << _8n3 * BigInt(i);
      if (num < start)
        throw r.err(`Wrong CompactSize(${8 * bytes})`);
      return num;
    }
  }));
})();
var CompactSizeLen = /* @__PURE__ */ (() => Object.freeze(apply(CompactSize, coders.numberBigint)))();
var _VarBytes = /* @__PURE__ */ (() => Object.freeze(createBytes(CompactSize)))();
var VarBytes = _VarBytes;
var _RawWitness = /* @__PURE__ */ (() => Object.freeze(array(CompactSizeLen, _VarBytes)))();
var RawWitness = _RawWitness;
var BTCArray = (t) => array(CompactSize, t);
var RawInput = /* @__PURE__ */ (() => Object.freeze(struct({
  txid: createBytes(32, true),
  index: U32LE,
  finalScriptSig: _VarBytes,
  sequence: U32LE
})))();
var RawOutput = /* @__PURE__ */ (() => Object.freeze(struct({ amount: U64LE, script: _VarBytes })))();
var _RawTx = /* @__PURE__ */ (() => struct({
  version: I32LE,
  segwitFlag: flag(new Uint8Array([0, 1])),
  inputs: BTCArray(RawInput),
  outputs: BTCArray(RawOutput),
  witnesses: flagged("segwitFlag", array("inputs/length", _RawWitness)),
  lockTime: U32LE
}))();
function validateRawTx(tx) {
  if (tx.segwitFlag && tx.witnesses && tx.witnesses.every((w) => !w.length))
    throw new Error("Segwit flag with only empty witness fields");
  return tx;
}
var RawTx = /* @__PURE__ */ (() => Object.freeze(validate(_RawTx, validateRawTx)))();
var RawOldTx = /* @__PURE__ */ (() => Object.freeze(struct({
  version: I32LE,
  inputs: BTCArray(RawInput),
  outputs: BTCArray(RawOutput),
  lockTime: U32LE
})))();

// node_modules/@scure/btc-signer/psbt.js
var unknowns = (mode, name) => {
  if (mode === true)
    return "ignore";
  if (mode === false)
    return "strip";
  if (mode === "ignore" || mode === "strip" || mode === "strict")
    return mode;
  throw new Error(`PSBT: invalid ${name} policy=${mode}`);
};
var _0n10 = /* @__PURE__ */ BigInt(0);
var _1n7 = /* @__PURE__ */ BigInt(1);
var PubKeyECDSA = /* @__PURE__ */ (() => validate(createBytes(null), (pub) => validatePubkey(pub, PubT.ecdsa)))();
var PubKeyECDSACompressed = /* @__PURE__ */ (() => validate(createBytes(33), (pub) => validatePubkey(pub, PubT.ecdsa)))();
var PubKeySchnorr = /* @__PURE__ */ (() => validate(createBytes(32), (pub) => validatePubkey(pub, PubT.schnorr)))();
var SignatureSchnorr = /* @__PURE__ */ (() => validate(createBytes(null), (sig) => {
  if (sig.length !== 64 && sig.length !== 65)
    throw new Error("Schnorr signature should be 64 or 65 bytes long");
  return sig;
}))();
var RawWitnessWire = RawWitness;
var BIP32Der = /* @__PURE__ */ (() => struct({
  fingerprint: U32BE,
  path: array(null, U32LE)
}))();
var TaprootBIP32Der = /* @__PURE__ */ (() => struct({
  hashes: array(CompactSizeLen, createBytes(32)),
  der: BIP32Der
}))();
var GlobalXPUB = /* @__PURE__ */ (() => validate(struct({
  version: U32BE,
  depth: U8,
  parentFingerprint: U32BE,
  childNumber: U32BE,
  chainCode: createBytes(32),
  publicKey: PubKeyECDSACompressed
}), (xpub) => {
  if (xpub.depth === 0 && xpub.parentFingerprint !== 0)
    throw new Error("GlobalXPUB: depth=0 requires parentFingerprint=0");
  if (xpub.depth === 0 && xpub.childNumber !== 0)
    throw new Error("GlobalXPUB: depth=0 requires childNumber=0");
  return xpub;
}))();
var tapScriptSigKey = /* @__PURE__ */ (() => struct({ pubKey: PubKeySchnorr, leafHash: createBytes(32) }))();
var _TaprootControlBlock = /* @__PURE__ */ (() => struct({
  version: U8,
  internalKey: createBytes(32),
  merklePath: array(null, createBytes(32))
}))();
var TaprootControlBlock = /* @__PURE__ */ (() => Object.freeze(validate(_TaprootControlBlock, (cb) => {
  if (cb.merklePath.length > 128)
    throw new Error("TaprootControlBlock: merklePath should be of length 0..128 (inclusive)");
  return cb;
})))();
var tapTree = /* @__PURE__ */ (() => validate(array(null, struct({
  depth: U8,
  version: U8,
  script: VarBytes
})), (tree) => {
  if (tree.length < 1)
    throw new Error("tapTree: expected at least one tuple");
  let path = Array(tree[0].depth).fill(0);
  let maxDepth = tree[0].depth;
  for (let i = 1;i < tree.length; i++) {
    const { depth } = tree[i];
    if (depth > maxDepth)
      maxDepth = depth;
    let j = path.length - 1;
    while (j >= 0 && path[j] === 1)
      j--;
    if (j < 0)
      throw new Error("tapTree: tuples must be in DFS order");
    const next = path.slice(0, j);
    next.push(1);
    if (depth < next.length)
      throw new Error("tapTree: tuples must be in DFS order");
    while (next.length < depth)
      next.push(0);
    path = next;
  }
  let leaves = _0n10;
  for (let i = 0;i < tree.length; i++)
    leaves += _1n7 << BigInt(maxDepth - tree[i].depth);
  if (leaves !== _1n7 << BigInt(maxDepth))
    throw new Error("tapTree: tuples must describe a complete binary tree");
  return tree;
}))();
var BytesInf = /* @__PURE__ */ createBytes(null);
var ProprietaryKey = /* @__PURE__ */ (() => {
  const suffix = struct({
    identifier: createBytes(CompactSizeLen),
    subtype: CompactSizeLen,
    data: BytesInf
  });
  return validate(BytesInf, (key) => {
    try {
      suffix.decode(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Proprietary key: expected BIP174 identifier and subtype, got ${message}`);
    }
    return key;
  });
})();
var Bytes20 = /* @__PURE__ */ createBytes(20);
var Bytes32 = /* @__PURE__ */ createBytes(32);
var Bytes64 = /* @__PURE__ */ createBytes(64);
var Bytes66 = /* @__PURE__ */ createBytes(66);
var MuSig2Participants = /* @__PURE__ */ (() => array(null, PubKeyECDSACompressed))();
var MuSig2Key = /* @__PURE__ */ (() => apply(BytesInf, {
  decode: (key) => {
    const _key = key;
    return concatBytes(PubKeyECDSACompressed.encode(_key.participantPubkey), PubKeyECDSACompressed.encode(_key.aggregatePubkey), _key.leafHash === undefined ? EMPTY : Bytes32.encode(_key.leafHash));
  },
  encode: (raw) => {
    const _raw = raw;
    if (_raw.length !== 66 && _raw.length !== 98)
      throw new Error(`MuSig2 key: expected 66 or 98 bytes, got ${_raw.length}`);
    const key = {
      participantPubkey: PubKeyECDSACompressed.decode(_raw.subarray(0, 33)),
      aggregatePubkey: PubKeyECDSACompressed.decode(_raw.subarray(33, 66))
    };
    if (_raw.length === 98)
      key.leafHash = Bytes32.decode(_raw.subarray(66));
    return key;
  }
}))();
var SilentPaymentInfo = /* @__PURE__ */ (() => struct({ scanKey: PubKeyECDSACompressed, spendKey: PubKeyECDSACompressed }))();
var DNSSECProof = /* @__PURE__ */ (() => struct({ name: createBytes(U8), proof: BytesInf }))();
var PSBTInfo = (type, kc, vc, reqInc, allowInc, silentIgnore) => /* @__PURE__ */ Object.freeze([
  type,
  kc && typeof kc === "object" ? Object.freeze(kc) : kc,
  vc && typeof vc === "object" ? Object.freeze(vc) : vc,
  Object.freeze([...reqInc]),
  Object.freeze([...allowInc]),
  silentIgnore
]);
var PSBTGlobal = /* @__PURE__ */ (() => Object.freeze({
  unsignedTx: PSBTInfo(0, false, RawOldTx, [0], [0], false),
  xpub: PSBTInfo(1, GlobalXPUB, BIP32Der, [], [0, 2], false),
  txVersion: PSBTInfo(2, false, U32LE, [2], [2], false),
  fallbackLocktime: PSBTInfo(3, false, U32LE, [], [2], false),
  inputCount: PSBTInfo(4, false, CompactSizeLen, [2], [2], false),
  outputCount: PSBTInfo(5, false, CompactSizeLen, [2], [2], false),
  txModifiable: PSBTInfo(6, false, U8, [], [2], false),
  spEcdhShare: PSBTInfo(7, PubKeyECDSACompressed, PubKeyECDSACompressed, [], [2], false),
  spDleq: PSBTInfo(8, PubKeyECDSACompressed, Bytes64, [], [2], false),
  genericSignedMessage: PSBTInfo(9, false, BytesInf, [], [0, 2], false),
  version: PSBTInfo(251, false, U32LE, [], [0, 2], false),
  proprietary: PSBTInfo(252, ProprietaryKey, BytesInf, [], [0, 2], false)
}))();
var PSBTInput = /* @__PURE__ */ (() => Object.freeze({
  nonWitnessUtxo: PSBTInfo(0, false, RawTx, [], [0, 2], false),
  witnessUtxo: PSBTInfo(1, false, RawOutput, [], [0, 2], false),
  partialSig: PSBTInfo(2, PubKeyECDSA, BytesInf, [], [0, 2], false),
  sighashType: PSBTInfo(3, false, U32LE, [], [0, 2], false),
  redeemScript: PSBTInfo(4, false, BytesInf, [], [0, 2], false),
  witnessScript: PSBTInfo(5, false, BytesInf, [], [0, 2], false),
  bip32Derivation: PSBTInfo(6, PubKeyECDSA, BIP32Der, [], [0, 2], false),
  finalScriptSig: PSBTInfo(7, false, BytesInf, [], [0, 2], false),
  finalScriptWitness: PSBTInfo(8, false, RawWitnessWire, [], [0, 2], false),
  porCommitment: PSBTInfo(9, false, BytesInf, [], [0, 2], false),
  ripemd160: PSBTInfo(10, Bytes20, BytesInf, [], [0, 2], false),
  sha256: PSBTInfo(11, Bytes32, BytesInf, [], [0, 2], false),
  hash160: PSBTInfo(12, Bytes20, BytesInf, [], [0, 2], false),
  hash256: PSBTInfo(13, Bytes32, BytesInf, [], [0, 2], false),
  txid: PSBTInfo(14, false, createBytes(32, true), [2], [2], true),
  index: PSBTInfo(15, false, U32LE, [2], [2], true),
  sequence: PSBTInfo(16, false, U32LE, [], [2], true),
  requiredTimeLocktime: PSBTInfo(17, false, U32LE, [], [2], false),
  requiredHeightLocktime: PSBTInfo(18, false, U32LE, [], [2], false),
  tapKeySig: PSBTInfo(19, false, SignatureSchnorr, [], [0, 2], false),
  tapScriptSig: PSBTInfo(20, tapScriptSigKey, SignatureSchnorr, [], [0, 2], false),
  tapLeafScript: PSBTInfo(21, TaprootControlBlock, BytesInf, [], [0, 2], false),
  tapBip32Derivation: PSBTInfo(22, PubKeySchnorr, TaprootBIP32Der, [], [0, 2], false),
  tapInternalKey: PSBTInfo(23, false, PubKeySchnorr, [], [0, 2], false),
  tapMerkleRoot: PSBTInfo(24, false, Bytes32, [], [0, 2], false),
  p2cKeyTweak: PSBTInfo(25, PubKeyECDSACompressed, Bytes32, [], [0, 2], false),
  musig2ParticipantPubkeys: PSBTInfo(26, PubKeyECDSACompressed, MuSig2Participants, [], [0, 2], false),
  musig2PubNonce: PSBTInfo(27, MuSig2Key, Bytes66, [], [0, 2], false),
  musig2PartialSig: PSBTInfo(28, MuSig2Key, Bytes32, [], [0, 2], false),
  spEcdhShare: PSBTInfo(29, PubKeyECDSACompressed, PubKeyECDSACompressed, [], [2], false),
  spDleq: PSBTInfo(30, PubKeyECDSACompressed, Bytes64, [], [2], false),
  spSpendBip32Derivation: PSBTInfo(31, PubKeyECDSACompressed, BIP32Der, [], [2], false),
  spTweak: PSBTInfo(32, false, Bytes32, [], [2], false),
  proprietary: PSBTInfo(252, ProprietaryKey, BytesInf, [], [0, 2], false)
}))();
var PSBTInputFinalKeys = /* @__PURE__ */ Object.freeze([
  "txid",
  "sequence",
  "index",
  "witnessUtxo",
  "nonWitnessUtxo",
  "requiredTimeLocktime",
  "requiredHeightLocktime",
  "finalScriptSig",
  "finalScriptWitness",
  "unknown"
]);
var PSBTInputSignatureKeys = /* @__PURE__ */ Object.freeze([
  "partialSig",
  "finalScriptSig",
  "finalScriptWitness",
  "tapKeySig",
  "tapScriptSig"
]);
var PSBTOutput = /* @__PURE__ */ (() => Object.freeze({
  redeemScript: PSBTInfo(0, false, BytesInf, [], [0, 2], false),
  witnessScript: PSBTInfo(1, false, BytesInf, [], [0, 2], false),
  bip32Derivation: PSBTInfo(2, PubKeyECDSA, BIP32Der, [], [0, 2], false),
  amount: PSBTInfo(3, false, I64LE, [2], [2], true),
  script: PSBTInfo(4, false, BytesInf, [2], [2], true),
  tapInternalKey: PSBTInfo(5, false, PubKeySchnorr, [], [0, 2], false),
  tapTree: PSBTInfo(6, false, tapTree, [], [0, 2], false),
  tapBip32Derivation: PSBTInfo(7, PubKeySchnorr, TaprootBIP32Der, [], [0, 2], false),
  musig2ParticipantPubkeys: PSBTInfo(8, PubKeyECDSACompressed, MuSig2Participants, [], [0, 2], false),
  spV0Info: PSBTInfo(9, false, SilentPaymentInfo, [], [2], false),
  spV0Label: PSBTInfo(10, false, U32LE, [], [2], false),
  dnssecProof: PSBTInfo(53, false, DNSSECProof, [], [0, 2], false),
  proprietary: PSBTInfo(252, ProprietaryKey, BytesInf, [], [0, 2], false)
}))();
var PSBTOutputUnsignedKeys = /* @__PURE__ */ Object.freeze([]);
var PSBTKeyPair = /* @__PURE__ */ (() => array(NULL, struct({
  key: prefix(CompactSizeLen, struct({ type: CompactSizeLen, key: createBytes(null) })),
  value: createBytes(CompactSizeLen)
})))();
function PSBTKeyInfo(info) {
  const [type, kc, vc, reqInc, allowInc, silentIgnore] = info;
  return { type, kc, vc, reqInc, allowInc, silentIgnore };
}
var PSBTUnknownKey = /* @__PURE__ */ (() => struct({ type: CompactSizeLen, key: createBytes(null) }))();
function PSBTKeyMap(psbtEnum) {
  const byType = {};
  for (const k in psbtEnum) {
    const [num, kc, vc] = psbtEnum[k];
    byType[num] = [k, kc, vc];
  }
  return wrap({
    encodeStream: (w, value) => {
      const _value = value;
      let out = [];
      const seen = {};
      const add = (key, value) => {
        const _value = value;
        const kStr = hex.encode(PSBTUnknownKey.encode(key));
        if (seen[kStr])
          throw new Error(`PSBT: duplicate key=${kStr}`);
        seen[kStr] = true;
        out.push({ key, value: _value });
      };
      for (const name in psbtEnum) {
        const val = _value[name];
        if (val === undefined)
          continue;
        const [type, kc, vc] = psbtEnum[name];
        if (!kc) {
          add({ type, key: EMPTY }, vc.encode(val));
        } else {
          const kv = val.map(([k, v]) => [
            kc.encode(k),
            vc.encode(v)
          ]);
          kv.sort((a, b) => compareBytes(a[0], b[0]));
          for (const [key, value] of kv)
            add({ key, type }, value);
        }
      }
      if (_value.unknown) {
        _value.unknown.sort((a, b) => compareBytes(a[0].key, b[0].key));
        for (const [k, v] of _value.unknown)
          add(k, v);
      }
      PSBTKeyPair.encodeStream(w, out);
    },
    decodeStream: (r) => {
      const raw = PSBTKeyPair.decodeStream(r);
      const out = {};
      const noKey = {};
      const seen = {};
      for (const elm of raw) {
        const kStr = hex.encode(PSBTUnknownKey.encode(elm.key));
        if (seen[kStr])
          throw new Error(`PSBT: duplicate key=${kStr}`);
        seen[kStr] = true;
        let name = "unknown";
        let key = elm.key.key;
        let value = elm.value;
        if (byType[elm.key.type]) {
          const [_name, kc, vc] = byType[elm.key.type];
          name = _name;
          if (!kc && key.length) {
            throw new Error(`PSBT: Non-empty key for ${name} (key=${hex.encode(key)} value=${hex.encode(value)}`);
          }
          key = kc ? kc.decode(key) : undefined;
          value = vc.decode(value);
          if (!kc) {
            if (out[name])
              throw new Error(`PSBT: Same keys: ${name} (key=${key} value=${value})`);
            out[name] = value;
            noKey[name] = true;
            continue;
          }
        } else {
          key = { type: elm.key.type, key: elm.key.key };
        }
        if (noKey[name])
          throw new Error(`PSBT: Key type with empty key and no key=${name} val=${value}`);
        if (!out[name])
          out[name] = [];
        out[name].push([key, value]);
      }
      return out;
    }
  });
}
var PSBTInputCoder = /* @__PURE__ */ (() => Object.freeze(validate(PSBTKeyMap(PSBTInput), (i) => {
  if (i.finalScriptWitness && !i.finalScriptWitness.length)
    throw new Error("validateInput: empty finalScriptWitness");
  if (i.partialSig && !i.partialSig.length)
    throw new Error("Empty partialSig");
  if (i.partialSig)
    for (const [k] of i.partialSig)
      validatePubkey(k, PubT.ecdsa);
  if (i.bip32Derivation)
    for (const [k] of i.bip32Derivation)
      validatePubkey(k, PubT.ecdsa);
  if (i.requiredTimeLocktime !== undefined && i.requiredTimeLocktime < 500000000)
    throw new Error(`validateInput: wrong timeLocktime=${i.requiredTimeLocktime}`);
  if (i.requiredHeightLocktime !== undefined && (i.requiredHeightLocktime <= 0 || i.requiredHeightLocktime >= 500000000))
    throw new Error(`validateInput: wrong heighLocktime=${i.requiredHeightLocktime}`);
  if (i.tapLeafScript) {
    for (const [k, v] of i.tapLeafScript) {
      if ((k.version & 254) !== v[v.length - 1])
        throw new Error("validateInput: tapLeafScript version mimatch");
      if (v[v.length - 1] & 1)
        throw new Error("validateInput: tapLeafScript version has parity bit!");
    }
  }
  return i;
})))();
var PSBTOutputCoder = /* @__PURE__ */ (() => Object.freeze(validate(PSBTKeyMap(PSBTOutput), (o) => {
  if (o.amount !== undefined && o.amount < _0n10)
    throw new Error(`validateOutput: wrong amount=${o.amount}`);
  if (o.bip32Derivation)
    for (const [k] of o.bip32Derivation)
      validatePubkey(k, PubT.ecdsa);
  return o;
})))();
var PSBTGlobalCoder = /* @__PURE__ */ (() => validate(PSBTKeyMap(PSBTGlobal), (g) => {
  const version = g.version || 0;
  if (version === 0) {
    if (!g.unsignedTx)
      throw new Error("PSBTv0: missing unsignedTx");
    for (const inp of g.unsignedTx.inputs)
      if (inp.finalScriptSig && inp.finalScriptSig.length)
        throw new Error("PSBTv0: input scriptSig found in unsignedTx");
  }
  for (const [xpub, der] of g.xpub || []) {
    if (xpub.depth !== der.path.length)
      throw new Error(`PSBT_GLOBAL_XPUB: xpub depth=${xpub.depth} must match derivation path length=${der.path.length}`);
  }
  return g;
}))();
var _RawPSBTV0 = /* @__PURE__ */ (() => Object.freeze(struct({
  magic: magic(string(new Uint8Array([255])), "psbt"),
  global: PSBTGlobalCoder,
  inputs: array("global/unsignedTx/inputs/length", PSBTInputCoder),
  outputs: array(null, PSBTOutputCoder)
})))();
var _RawPSBTV2 = /* @__PURE__ */ (() => Object.freeze(struct({
  magic: magic(string(new Uint8Array([255])), "psbt"),
  global: PSBTGlobalCoder,
  inputs: array("global/inputCount", PSBTInputCoder),
  outputs: array("global/outputCount", PSBTOutputCoder)
})))();
function validatePSBTFields(version, info, lst) {
  const _lst = lst;
  for (const k in _lst) {
    if (k === "unknown")
      continue;
    if (!info[k])
      continue;
    const { allowInc } = PSBTKeyInfo(info[k]);
    if (!allowInc.includes(version))
      throw new Error(`PSBTv${version}: field ${k} is not allowed`);
  }
  for (const k in info) {
    const { reqInc } = PSBTKeyInfo(info[k]);
    if (reqInc.includes(version) && _lst[k] === undefined)
      throw new Error(`PSBTv${version}: missing required field ${k}`);
  }
}
function cleanPSBTFields(version, info, lst) {
  anumber(version, "version");
  validateObject2(info, {}, {}, "info");
  validateObject2(lst, {}, {}, "lst");
  const _lst = lst;
  const out = {};
  for (const _k in _lst) {
    const k = _k;
    if (k !== "unknown") {
      if (!info[k])
        continue;
      const { allowInc, silentIgnore } = PSBTKeyInfo(info[k]);
      if (!allowInc.includes(version)) {
        if (silentIgnore)
          continue;
        throw new Error(`Failed to serialize in PSBTv${version}: ${k} but versions allows inclusion=${allowInc}`);
      }
    }
    out[k] = _lst[k];
  }
  return out;
}
function validatePSBT(tx) {
  const version = tx && tx.global && tx.global.version || 0;
  validatePSBTFields(version, PSBTGlobal, tx.global);
  for (const i of tx.inputs)
    validatePSBTFields(version, PSBTInput, i);
  for (const o of tx.outputs)
    validatePSBTFields(version, PSBTOutput, o);
  const inputCount = !version ? tx.global.unsignedTx.inputs.length : tx.global.inputCount;
  if (tx.inputs.length !== inputCount)
    throw new Error(`Wrong number of input maps=${tx.inputs.length}, expected=${inputCount}`);
  const outputCount = !version ? tx.global.unsignedTx.outputs.length : tx.global.outputCount;
  if (tx.outputs.length < outputCount)
    throw new Error("Not outputs inputs");
  const hasBip174InputMap = version === 0 && inputCount === 0 && Object.keys(tx.outputs[0] || {}).length === 0 && (outputCount > 0 && tx.outputs.length === outputCount + 1 || outputCount === 0 && tx.outputs.length === 2 && Object.keys(tx.outputs[1]).length === 0);
  if (hasBip174InputMap)
    return tx;
  const outputsLeft = tx.outputs.slice(outputCount);
  if (outputsLeft.length > 1 || outputsLeft.length && (version !== 0 || Object.keys(outputsLeft[0]).length))
    throw new Error(`Unexpected outputs left in tx=${outputsLeft}`);
  return tx;
}
function mergeKeyMap(psbtEnum, val, cur, allowedFields, unknown = "strip", proprietary = "strip") {
  validateObject2(psbtEnum, {}, {}, "psbtEnum");
  validateObject2(val, {}, {}, "val");
  if (cur !== undefined)
    validateObject2(cur, {}, {}, "cur");
  if (allowedFields !== undefined)
    aarray2(allowedFields, "allowedFields");
  const _val = val;
  const _cur = cur;
  const _allowedFields = allowedFields;
  const unknownMode = unknowns(unknown, "unknown");
  const proprietaryMode = unknowns(proprietary, "proprietary");
  for (const [name, mode] of [
    ["unknown", unknownMode],
    ["proprietary", proprietaryMode]
  ]) {
    if (mode !== "strict")
      continue;
    if (_val[name]?.length || _cur?.[name]?.length)
      throw new Error(`PSBT: ${name} PSBT field is not allowed in strict mode`);
  }
  const res = { ..._cur, ..._val };
  for (const k in psbtEnum) {
    const key = k;
    if (k === "proprietary" && proprietaryMode !== "ignore")
      continue;
    const [_, kC, vC] = psbtEnum[key];
    const cannotChange = _allowedFields && !_allowedFields.includes(k);
    if (_val[k] === undefined && k in _val) {
      if (cannotChange)
        throw new Error(`Cannot remove signed field=${k}`);
      delete res[k];
    } else if (kC) {
      const oldKV = _cur && _cur[k] ? _cur[k] : [];
      let newKV = _val[key];
      if (newKV) {
        if (!Array.isArray(newKV))
          throw new Error(`keyMap(${k}): KV pairs should be [k, v][]`);
        newKV = newKV.map((val) => {
          if (val.length !== 2)
            throw new Error(`keyMap(${k}): KV pairs should be [k, v][]`);
          return [
            typeof val[0] === "string" ? kC.decode(hex.decode(val[0])) : val[0],
            typeof val[1] === "string" ? vC.decode(hex.decode(val[1])) : val[1]
          ];
        });
        const map = {};
        const add = (kStr, k, v) => {
          if (map[kStr] === undefined) {
            map[kStr] = [k, v];
            return;
          }
          const oldVal = hex.encode(vC.encode(map[kStr][1]));
          const newVal = hex.encode(vC.encode(v));
          if (oldVal !== newVal)
            throw new Error(`keyMap(${key}): same key=${kStr} oldVal=${oldVal} newVal=${newVal}`);
        };
        for (const [k, v] of oldKV) {
          const kStr = hex.encode(kC.encode(k));
          add(kStr, k, v);
        }
        for (const [k, v] of newKV) {
          const kStr = hex.encode(kC.encode(k));
          if (v === undefined) {
            if (cannotChange)
              throw new Error(`Cannot remove signed field=${key}/${k}`);
            delete map[kStr];
          } else {
            if (cannotChange && map[kStr] === undefined)
              throw new Error(`Cannot add signed field=${key}/${kStr}`);
            add(kStr, k, v);
          }
        }
        res[key] = Object.values(map);
      }
    } else {
      if (typeof res[k] === "string")
        res[k] = vC.decode(hex.decode(res[k]));
      if (cannotChange && k in _val) {
        if (!_cur || _cur[k] === undefined)
          throw new Error(`Cannot add signed field=${k}`);
        let current = _cur[k];
        if (typeof current === "string")
          current = vC.decode(hex.decode(current));
        if (!equalBytes2(vC.encode(res[k]), vC.encode(current)))
          throw new Error(`Cannot change signed field=${k}`);
      }
    }
  }
  if (unknownMode === "ignore" && _val.unknown) {
    const map = {};
    for (const [k, v] of _cur?.unknown || [])
      map[hex.encode(PSBTUnknownKey.encode(k))] = [k, v];
    for (const [k, v] of _val.unknown) {
      const kStr = hex.encode(PSBTUnknownKey.encode(k));
      if (map[kStr] === undefined) {
        map[kStr] = [k, v];
        continue;
      }
      const oldVal = hex.encode(BytesInf.encode(map[kStr][1]));
      const newVal = hex.encode(BytesInf.encode(v));
      if (oldVal !== newVal)
        throw new Error(`keyMap(unknown): same key=${kStr} oldVal=${oldVal} newVal=${newVal}`);
    }
    res.unknown = Object.values(map);
  }
  for (const k in res) {
    if (!psbtEnum[k]) {
      if (unknownMode === "ignore" && k === "unknown")
        continue;
      delete res[k];
    }
  }
  if (unknownMode !== "ignore")
    delete res.unknown;
  if (proprietaryMode !== "ignore")
    delete res.proprietary;
  return res;
}
function combineKeyMap(psbtEnum, current, other, unknown = "strip", proprietary = "strip") {
  validateObject2(psbtEnum, {}, {}, "psbtEnum");
  validateObject2(current, {}, {}, "current");
  validateObject2(other, {}, {}, "other");
  const _current = current;
  const _other = other;
  for (const k in psbtEnum) {
    const key = k;
    const [_, keyCoder, valueCoder] = psbtEnum[key];
    if (keyCoder || _current[key] === undefined || _other[key] === undefined)
      continue;
    let a = _current[key];
    let b = _other[key];
    if (typeof a === "string")
      a = valueCoder.decode(hex.decode(a));
    if (typeof b === "string")
      b = valueCoder.decode(hex.decode(b));
    if (!equalBytes2(valueCoder.encode(a), valueCoder.encode(b)))
      throw new Error(`Cannot combine conflicting field=${k}`);
  }
  return mergeKeyMap(psbtEnum, _other, _current, undefined, unknown, proprietary);
}
var RawPSBTV0 = /* @__PURE__ */ (() => Object.freeze(validate(_RawPSBTV0, validatePSBT)))();
var RawPSBTV2 = /* @__PURE__ */ (() => Object.freeze(validate(_RawPSBTV2, validatePSBT)))();

// node_modules/@scure/btc-signer/payment.js
var P2A_PROGRAM = /* @__PURE__ */ Uint8Array.from([78, 115]);
var OutP2A = {
  encode(from) {
    if (from.length !== 2 || from[0] !== 1 || !isBytes5(from[1]) || !equalBytes2(from[1], P2A_PROGRAM))
      return;
    return { type: "p2a", script: Script.encode(from) };
  },
  decode: (to) => {
    if (to.type !== "p2a")
      return;
    return [1, Uint8Array.from(P2A_PROGRAM)];
  }
};
function isValidPubkey(pub, type) {
  try {
    validatePubkey(pub, type);
    return true;
  } catch (e) {
    return false;
  }
}
var OutPK = {
  encode(from) {
    if (from.length !== 2 || !isBytes5(from[0]) || !isValidPubkey(from[0], PubT.ecdsa) || from[1] !== "CHECKSIG")
      return;
    return { type: "pk", pubkey: from[0] };
  },
  decode: (to) => {
    if (to.type !== "pk")
      return;
    return [to.pubkey, "CHECKSIG"];
  }
};
var OutPKH = {
  encode(from) {
    if (from.length !== 5 || from[0] !== "DUP" || from[1] !== "HASH160" || !isBytes5(from[2]))
      return;
    if (from[2].length !== 20)
      return;
    if (from[3] !== "EQUALVERIFY" || from[4] !== "CHECKSIG")
      return;
    return { type: "pkh", hash: from[2] };
  },
  decode: (to) => to.type === "pkh" ? ["DUP", "HASH160", to.hash, "EQUALVERIFY", "CHECKSIG"] : undefined
};
var OutSH = {
  encode(from) {
    if (from.length !== 3 || from[0] !== "HASH160" || !isBytes5(from[1]) || from[2] !== "EQUAL")
      return;
    if (from[1].length !== 20)
      return;
    return { type: "sh", hash: from[1] };
  },
  decode: (to) => to.type === "sh" ? ["HASH160", to.hash, "EQUAL"] : undefined
};
var OutWSH = {
  encode(from) {
    if (from.length !== 2 || from[0] !== 0 || !isBytes5(from[1]))
      return;
    if (from[1].length !== 32)
      return;
    return { type: "wsh", hash: from[1] };
  },
  decode: (to) => to.type === "wsh" ? [0, to.hash] : undefined
};
var OutWPKH = {
  encode(from) {
    if (from.length !== 2 || from[0] !== 0 || !isBytes5(from[1]))
      return;
    if (from[1].length !== 20)
      return;
    return { type: "wpkh", hash: from[1] };
  },
  decode: (to) => to.type === "wpkh" ? [0, to.hash] : undefined
};
var OutMS = {
  encode(from) {
    const last = from.length - 1;
    if (from[last] !== "CHECKMULTISIG")
      return;
    const m = from[0];
    const n = from[last - 1];
    if (typeof m !== "number" || typeof n !== "number")
      return;
    const pubkeys = from.slice(1, -2);
    if (n !== pubkeys.length)
      return;
    for (const pub of pubkeys)
      if (!isBytes5(pub) || !isValidPubkey(pub, PubT.ecdsa))
        return;
    if (!Number.isSafeInteger(m) || m < 1 || m > n)
      return;
    return { type: "ms", m, pubkeys };
  },
  decode: (to) => to.type === "ms" ? [to.m, ...to.pubkeys, to.pubkeys.length, "CHECKMULTISIG"] : undefined
};
var OutTR = {
  encode(from) {
    if (from.length !== 2 || from[0] !== 1 || !isBytes5(from[1]) || from[1].length !== 32)
      return;
    if (!isValidPubkey(from[1], PubT.schnorr))
      return;
    return { type: "tr", pubkey: from[1] };
  },
  decode: (to) => to.type === "tr" ? [1, to.pubkey] : undefined
};
var OutTRNS = {
  encode(from) {
    const last = from.length - 1;
    if (from[last] !== "CHECKSIG")
      return;
    const pubkeys = [];
    for (let i = 0;i < last; i++) {
      const elm = from[i];
      if (i & 1) {
        if (elm !== "CHECKSIGVERIFY" || i === last - 1)
          return;
        continue;
      }
      if (!isBytes5(elm) || !isValidPubkey(elm, PubT.schnorr))
        return;
      pubkeys.push(elm);
    }
    if (!pubkeys.length || pubkeys.length > 999)
      return;
    return { type: "tr_ns", pubkeys };
  },
  decode: (to) => {
    if (to.type !== "tr_ns")
      return;
    const out = [];
    for (let i = 0;i < to.pubkeys.length - 1; i++)
      out.push(to.pubkeys[i], "CHECKSIGVERIFY");
    out.push(to.pubkeys[to.pubkeys.length - 1], "CHECKSIG");
    return out;
  }
};
var OutTRMS = {
  encode(from) {
    const last = from.length - 1;
    if (from[last] !== "NUMEQUAL" || from[1] !== "CHECKSIG")
      return;
    const pubkeys = [];
    const m = OpToNum(from[last - 1]);
    if (typeof m !== "number")
      return;
    for (let i = 0;i < last - 1; i++) {
      const elm = from[i];
      if (i & 1) {
        if (elm !== (i === 1 ? "CHECKSIG" : "CHECKSIGADD"))
          return;
        continue;
      }
      if (!isBytes5(elm) || !isValidPubkey(elm, PubT.schnorr))
        return;
      pubkeys.push(elm);
    }
    if (!Number.isSafeInteger(m) || m < 1 || m > pubkeys.length || pubkeys.length > 999)
      return;
    return { type: "tr_ms", pubkeys, m };
  },
  decode: (to) => {
    if (to.type !== "tr_ms")
      return;
    const out = [to.pubkeys[0], "CHECKSIG"];
    for (let i = 1;i < to.pubkeys.length; i++)
      out.push(to.pubkeys[i], "CHECKSIGADD");
    out.push(to.m, "NUMEQUAL");
    return out;
  }
};
var OutUnknown = {
  encode(from) {
    return { type: "unknown", script: Script.encode(from) };
  },
  decode: (to) => to.type === "unknown" ? Script.decode(to.script) : undefined
};
var OutScripts = /* @__PURE__ */ (() => [
  OutP2A,
  OutPK,
  OutPKH,
  OutSH,
  OutWSH,
  OutWPKH,
  OutMS,
  OutTR,
  OutTRNS,
  OutTRMS,
  OutUnknown
])();
var _OutScript = /* @__PURE__ */ (() => apply(Script, coders.match(OutScripts)))();
var OutScript = /* @__PURE__ */ (() => Object.freeze(validate(_OutScript, (i) => {
  if (i.type === "pk" && !isValidPubkey(i.pubkey, PubT.ecdsa))
    throw new Error("OutScript/pk: wrong key");
  if ((i.type === "pkh" || i.type === "sh" || i.type === "wpkh") && (!isBytes5(i.hash) || i.hash.length !== 20))
    throw new Error(`OutScript/${i.type}: wrong hash`);
  if (i.type === "wsh" && (!isBytes5(i.hash) || i.hash.length !== 32))
    throw new Error(`OutScript/wsh: wrong hash`);
  if (i.type === "tr" && (!isBytes5(i.pubkey) || !isValidPubkey(i.pubkey, PubT.schnorr)))
    throw new Error("OutScript/tr: wrong taproot public key");
  if (i.type === "ms" || i.type === "tr_ns" || i.type === "tr_ms") {
    if (!Array.isArray(i.pubkeys))
      throw new Error("OutScript/multisig: wrong pubkeys array");
  }
  if (i.type === "ms") {
    const n = i.pubkeys.length;
    for (const p of i.pubkeys)
      if (!isValidPubkey(p, PubT.ecdsa))
        throw new Error("OutScript/multisig: wrong pubkey");
    anumber(i.m, "m");
    if (i.m <= 0 || n > 16 || i.m > n)
      throw new Error("OutScript/multisig: invalid params");
  }
  if (i.type === "tr_ns" || i.type === "tr_ms") {
    const n = i.pubkeys.length;
    if (n > 999)
      throw new Error(`OutScript/${i.type}: invalid params`);
    for (const p of i.pubkeys)
      if (!isValidPubkey(p, PubT.schnorr))
        throw new Error(`OutScript/${i.type}: wrong pubkey`);
  }
  if (i.type === "tr_ms") {
    const n = i.pubkeys.length;
    anumber(i.m, "m");
    if (i.m <= 0 || i.m > n)
      throw new Error("OutScript/tr_ms: invalid params");
  }
  return i;
})))();
var _WitnessOutScript = /* @__PURE__ */ (() => Object.freeze(wrap({
  encodeStream: (w, value) => OutScript.encodeStream(w, value),
  decodeStream: (r) => {
    const raw = r.bytes(r.leftBytes);
    const out = OutScript.decode(raw);
    if (out && (out.type === "p2a" || out.type === "wpkh" || out.type === "wsh" || out.type === "tr") && !equalBytes2(raw, OutScript.encode(out)))
      throw new Error("OutScript: non-canonical witness program");
    return out;
  }
})))();
function checkWSH(s, witnessScript) {
  if (!equalBytes2(s.hash, sha2562(witnessScript)))
    throw new Error("checkScript: wsh wrong witnessScript hash");
  const w = OutScript.decode(witnessScript);
  if (w.type === "tr" || w.type === "tr_ns" || w.type === "tr_ms")
    throw new Error(`checkScript: P2${w.type} cannot be wrapped in P2SH`);
  if (w.type === "wpkh" || w.type === "wsh" || w.type === "sh")
    throw new Error(`checkScript: P2${w.type} cannot be wrapped in P2WSH`);
}
function checkScript(script, redeemScript, witnessScript) {
  let hasWsh = false;
  let r = undefined;
  if (script) {
    const s = _WitnessOutScript.decode(script);
    if (s.type === "tr_ns" || s.type === "tr_ms" || s.type === "ms" || s.type == "pk")
      throw new Error(`checkScript: non-wrapped ${s.type}`);
    if (redeemScript) {
      if (s.type !== "sh")
        throw new Error("checkScript: redeemScript without P2SH");
      if (!equalBytes2(s.hash, hash1602(redeemScript)))
        throw new Error("checkScript: sh wrong redeemScript hash");
      r = _WitnessOutScript.decode(redeemScript);
      if (r?.type === "tr" || r?.type === "tr_ns" || r?.type === "tr_ms")
        throw new Error(`checkScript: P2${r.type} cannot be wrapped in P2SH`);
      if (r?.type === "sh")
        throw new Error("checkScript: P2SH cannot be wrapped in P2SH");
    }
    if (s.type === "wsh") {
      hasWsh = true;
      if (witnessScript)
        checkWSH(s, witnessScript);
    }
  }
  if (redeemScript) {
    if (r === undefined)
      r = _WitnessOutScript.decode(redeemScript);
    if (r?.type === "wsh") {
      hasWsh = true;
      if (witnessScript)
        checkWSH(r, witnessScript);
    }
  }
  if (witnessScript && !hasWsh)
    throw new Error("checkScript: witnessScript without P2WSH");
}
function uniqPubkey(pubkeys, type) {
  const map = {};
  for (const pub of pubkeys) {
    validatePubkey(pub, type);
    let normalized = pub;
    if (type === PubT.ecdsa && pub.length === 65) {
      normalized = new Uint8Array(33);
      normalized[0] = 2 | pub[64] & 1;
      normalized.set(pub.subarray(1, 33), 1);
    }
    const key = hex.encode(normalized);
    if (map[key])
      throw new Error(`Multisig: non-uniq pubkey: ${pubkeys.map(hex.encode)}`);
    map[key] = true;
  }
}
var p2pkh = (publicKey, network = NETWORK) => {
  if (!isValidPubkey(publicKey, PubT.ecdsa))
    throw new Error("P2PKH: invalid publicKey");
  const hash = hash1602(publicKey);
  return {
    type: "pkh",
    script: OutScript.encode({ type: "pkh", hash }),
    address: Address(network).encode({ type: "pkh", hash }),
    hash
  };
};
var checkCanonicalScript = (script, name, allowNonCanonicalScript) => {
  if (allowNonCanonicalScript)
    return;
  const decoded = Script.decode(script);
  const nonMinimalNumber = decoded.some((op) => isBytes5(op) && op.length === 1 && (1 <= op[0] && op[0] <= 16 || op[0] === 129));
  if (nonMinimalNumber || !equalBytes2(script, Script.encode(decoded))) {
    const wrapper = name === "redeemScript" ? "P2SH" : "P2WSH";
    throw new Error(`${wrapper}: non-canonical ${name}`);
  }
};
var p2sh = (child, network = NETWORK, allowNonCanonicalScript = false) => {
  validateObject2(child, {}, {}, "child");
  const c = child;
  const cs = c.script;
  if (!isBytes5(cs))
    throw new Error(`Wrong script: ${typeof c.script}, expected Uint8Array`);
  if (cs.length > MAX_SCRIPT_BYTE_LENGTH)
    throw new Error(`P2SH: redeemScript exceeds ${MAX_SCRIPT_BYTE_LENGTH}-byte push limit: len=${cs.length}`);
  checkCanonicalScript(cs, "redeemScript", allowNonCanonicalScript);
  const hash = hash1602(cs);
  const out = { type: "sh", hash };
  const script = OutScript.encode(out);
  const address = Address(network).encode(out);
  checkScript(script, cs, c.witnessScript);
  if (c.witnessScript) {
    return {
      type: "sh",
      redeemScript: cs,
      script,
      address,
      hash,
      witnessScript: c.witnessScript
    };
  } else {
    return {
      type: "sh",
      redeemScript: cs,
      script,
      address,
      hash
    };
  }
};
var p2wsh = (child, network = NETWORK, allowNonCanonicalScript = false) => {
  validateObject2(child, {}, {}, "child");
  const cs = child.script;
  if (!isBytes5(cs))
    throw new Error(`Wrong script: ${typeof cs}, expected Uint8Array`);
  if (cs.length > 1e4)
    throw new Error("P2WSH: witnessScript exceeds 10,000 bytes");
  checkCanonicalScript(cs, "witnessScript", allowNonCanonicalScript);
  const hash = sha2562(cs);
  const script = OutScript.encode({ type: "wsh", hash });
  checkScript(script, undefined, cs);
  return {
    type: "wsh",
    witnessScript: cs,
    script,
    address: Address(network).encode({ type: "wsh", hash }),
    hash
  };
};
var p2wpkh = (publicKey, network = NETWORK) => {
  if (!isValidPubkey(publicKey, PubT.ecdsa))
    throw new Error("P2WPKH: invalid publicKey");
  if (publicKey.length === 65)
    throw new Error("P2WPKH: uncompressed public key");
  const hash = hash1602(publicKey);
  return {
    type: "wpkh",
    script: OutScript.encode({ type: "wpkh", hash }),
    address: Address(network).encode({ type: "wpkh", hash }),
    hash
  };
};
var p2ms = (m, pubkeys, allowSamePubkeys = false) => {
  if (!allowSamePubkeys)
    uniqPubkey(pubkeys, PubT.ecdsa);
  return {
    type: "ms",
    script: OutScript.encode({ type: "ms", pubkeys, m })
  };
};
function checkTaprootScript(script, internalPubKey, allowUnknownOutputs = false, customScripts) {
  const out = OutScript.decode(script);
  if (out.type === "unknown") {
    if (customScripts) {
      const cs = apply(Script, coders.match(customScripts));
      let c;
      try {
        c = cs.decode(script);
      } catch (e) {
        c = undefined;
      }
      if (c !== undefined) {
        if (!astring2(c.type, "c.type").startsWith("tr_"))
          throw new Error(`P2TR: invalid custom type=${c.type}`);
        return;
      }
    }
    if (allowUnknownOutputs)
      return;
  }
  if (!["tr_ns", "tr_ms"].includes(out.type))
    throw new Error(`P2TR: invalid leaf script=${out.type}`);
  const outms = out;
  if (!allowUnknownOutputs && outms.pubkeys) {
    for (const p of outms.pubkeys) {
      if (equalBytes2(p, taprootNumsKey()))
        throw new Error("Unspendable taproot key in leaf script");
      if (equalBytes2(p, internalPubKey)) {
        throw new Error("Using P2TR with leaf script with same key as internal key is not supported");
      }
    }
  }
}
function taprootListToTree(taprootList) {
  aarray2(taprootList, "taprootList", (leaf, title) => {
    if (Array.isArray(leaf))
      return;
    validateObject2(leaf, {}, {}, title);
    if (leaf.weight !== undefined)
      anumber(leaf.weight, title + ".weight");
  });
  if (!taprootList.length)
    throw new Error("taprootListToTree: empty tree");
  const lst = Array.from(taprootList);
  while (lst.length >= 2) {
    lst.sort((a, b) => (b.weight || 1) - (a.weight || 1));
    const b = lst.pop();
    const a = lst.pop();
    const weight = (a?.weight || 1) + (b?.weight || 1);
    lst.push({
      weight,
      childs: [a?.childs || a, b?.childs || b]
    });
  }
  const last = lst[0];
  return last?.childs || last;
}
function taprootAddPath(tree, path = []) {
  if (!tree)
    throw new Error(`taprootAddPath: empty tree`);
  if (tree.type === "leaf")
    return { ...tree, path };
  if (tree.type !== "branch")
    throw new Error(`taprootAddPath: wrong type=${tree}`);
  return {
    ...tree,
    path,
    left: taprootAddPath(tree.left, [tree.right.hash, ...path]),
    right: taprootAddPath(tree.right, [tree.left.hash, ...path])
  };
}
function taprootWalkTree(tree) {
  if (!tree)
    throw new Error(`taprootAddPath: empty tree`);
  if (tree.type === "leaf")
    return [tree];
  if (tree.type !== "branch")
    throw new Error(`taprootWalkTree: wrong type=${tree}`);
  return [...taprootWalkTree(tree.left), ...taprootWalkTree(tree.right)];
}
var TAPROOT_MAX_DEPTH = 128;
function taprootHashTree(tree, internalPubKey, allowUnknownOutputs = false, customScripts, depth = 0) {
  if (depth > TAPROOT_MAX_DEPTH)
    throw new RangeError(`P2TR: tree depth exceeds ${TAPROOT_MAX_DEPTH}`);
  if (tree === undefined)
    throw new Error("taprootHashTree: empty tree");
  if (!Array.isArray(tree) && !utils.isPlainObject(tree))
    throw new TypeError('"tree" expected object or array, got type=' + typeof tree);
  if (Array.isArray(tree) && tree.length === 1)
    tree = tree[0];
  if (!Array.isArray(tree)) {
    validateObject2(tree, {}, {}, "tree");
    const version = tree.leafVersion;
    const { script: leafScript } = tree;
    if (tree.tapLeafScript || tree.tapMerkleRoot && !equalBytes2(tree.tapMerkleRoot, EMPTY))
      throw new Error("P2TR: tapRoot leafScript cannot have tree");
    const script = typeof leafScript === "string" ? hex.decode(leafScript) : abytes2(leafScript, undefined, "tree.script");
    checkTaprootScript(script, internalPubKey, allowUnknownOutputs, customScripts);
    return {
      type: "leaf",
      version,
      script,
      hash: tapLeafHash(script, tapLeafVersion(version))
    };
  }
  if (tree.length !== 2)
    tree = taprootListToTree(tree);
  if (tree.length !== 2)
    throw new Error("hashTree: non binary tree!");
  const left = taprootHashTree(tree[0], internalPubKey, allowUnknownOutputs, customScripts, depth + 1);
  const right = taprootHashTree(tree[1], internalPubKey, allowUnknownOutputs, customScripts, depth + 1);
  let [lH, rH] = [left.hash, right.hash];
  if (compareBytes(rH, lH) === -1)
    [lH, rH] = [rH, lH];
  return {
    type: "branch",
    left,
    right,
    hash: tagSchnorr("TapBranch", lH, rH)
  };
}
var TAP_LEAF_VERSION = 192;
var tapLeafVersion = (version) => {
  if (version === undefined)
    return TAP_LEAF_VERSION;
  anumber(version, "leafVersion");
  if (version > 254 || version === 80 || !!(version & 1))
    throw new Error(`P2TR: invalid leafVersion=${version}`);
  return version;
};
var tapLeafHash = (script, version = TAP_LEAF_VERSION) => tagSchnorr("TapLeaf", new Uint8Array([tapLeafVersion(version)]), VarBytes.encode(script));
function p2tr(internalPubKey, tree, network = NETWORK, allowUnknownOutputs = false, customScripts) {
  if (!internalPubKey && !tree)
    throw new Error("p2tr: should have pubKey or scriptTree (or both)");
  const pubKey = typeof internalPubKey === "string" ? hex.decode(internalPubKey) : internalPubKey ?? taprootNumsKey();
  if (!isValidPubkey(pubKey, PubT.schnorr))
    throw new Error("p2tr: non-schnorr pubkey");
  if (tree) {
    let hashedTree = taprootAddPath(taprootHashTree(tree, pubKey, allowUnknownOutputs, customScripts));
    const tapMerkleRoot = hashedTree.hash;
    const [tweakedPubkey, parity] = taprootTweakPubkey(pubKey, tapMerkleRoot);
    const tapLeafScript = [];
    const leaves = taprootWalkTree(hashedTree).map((l) => {
      const version = tapLeafVersion(l.version);
      const controlBlock = {
        version: version + parity,
        internalKey: pubKey,
        merklePath: l.path
      };
      tapLeafScript.push([controlBlock, concatBytes4(l.script, new Uint8Array([version]))]);
      return { ...l, controlBlock: TaprootControlBlock.encode(controlBlock) };
    });
    return {
      type: "tr",
      script: OutScript.encode({ type: "tr", pubkey: tweakedPubkey }),
      address: Address(network).encode({ type: "tr", pubkey: tweakedPubkey }),
      tweakedPubkey,
      tapInternalKey: pubKey,
      leaves,
      tapLeafScript,
      tapMerkleRoot
    };
  } else {
    const tweakedPubkey = taprootTweakPubkey(pubKey, EMPTY)[0];
    return {
      type: "tr",
      script: OutScript.encode({ type: "tr", pubkey: tweakedPubkey }),
      address: Address(network).encode({ type: "tr", pubkey: tweakedPubkey }),
      tweakedPubkey,
      tapInternalKey: pubKey
    };
  }
}
var base58check3 = /* @__PURE__ */ createBase58check(sha2562);
function validateWitness(version, data) {
  if (data.length < 2 || data.length > 40)
    throw new Error("Witness: invalid length");
  if (version > 16)
    throw new Error("Witness: invalid version");
  if (version === 0 && !(data.length === 20 || data.length === 32))
    throw new Error("Witness: invalid length for version");
}
function programToWitness(version, data, network = NETWORK) {
  validateWitness(version, data);
  const coder = version === 0 ? bech32 : bech32m;
  return coder.encode(network.bech32, [version].concat(coder.toWords(data)));
}
function formatKey(hashed, prefix) {
  return base58check3.encode(concatBytes4(Uint8Array.from(prefix), hashed));
}
function Address(network = NETWORK) {
  validateObject2(network, {}, {}, "network");
  return {
    encode(from) {
      validateObject2(from, {}, {}, "from");
      const { type } = from;
      astring2(type, "from.type");
      if (type === "wpkh")
        return programToWitness(0, from.hash, network);
      else if (type === "wsh")
        return programToWitness(0, from.hash, network);
      else if (type === "tr")
        return programToWitness(1, from.pubkey, network);
      else if (type === "p2a")
        return programToWitness(1, P2A_PROGRAM, network);
      else if (type === "pkh")
        return formatKey(from.hash, [network.pubKeyHash]);
      else if (type === "sh")
        return formatKey(from.hash, [network.scriptHash]);
      throw new Error(`Unknown address type=${type}`);
    },
    decode(address) {
      astring2(address, "address");
      if (address.length < 14 || address.length > 74)
        throw new Error("Invalid address length");
      if (network.bech32 && address.toLowerCase().startsWith(`${network.bech32}1`)) {
        let res;
        try {
          res = bech32.decode(address);
          if (res.words[0] !== 0)
            throw new Error(`bech32: wrong version=${res.words[0]}`);
        } catch (_) {
          res = bech32m.decode(address);
          if (res.words[0] === 0)
            throw new Error(`bech32m: wrong version=${res.words[0]}`);
        }
        if (res.prefix !== network.bech32)
          throw new Error(`wrong bech32 prefix=${res.prefix}`);
        const [version, ...program] = res.words;
        const data = bech32.fromWords(program);
        validateWitness(version, data);
        if (version === 0 && data.length === 32)
          return { type: "wsh", hash: data };
        else if (version === 0 && data.length === 20)
          return { type: "wpkh", hash: data };
        else if (version === 1 && data.length === 32)
          return { type: "tr", pubkey: data };
        else if (version === 1 && equalBytes2(data, P2A_PROGRAM))
          return { type: "p2a", script: Script.encode([1, data]) };
        else
          throw new Error("Unknown witness program");
      }
      const data = base58check3.decode(address);
      if (data.length !== 21)
        throw new Error("Invalid base58 address");
      if (data[0] === network.pubKeyHash) {
        return { type: "pkh", hash: data.slice(1) };
      } else if (data[0] === network.scriptHash) {
        return {
          type: "sh",
          hash: data.slice(1)
        };
      }
      throw new Error(`Invalid address prefix=${data[0]}`);
    }
  };
}
// node_modules/@scure/btc-signer/transaction.js
var _0n11 = /* @__PURE__ */ BigInt(0);
var _1n8 = /* @__PURE__ */ BigInt(1);
var U64_MAX = /* @__PURE__ */ BigInt("0xffffffffffffffff");
var EMPTY32 = /* @__PURE__ */ new Uint8Array(32);
var EMPTY_OUTPUT = {
  amount: U64_MAX,
  script: EMPTY
};
var toVsize = (weight) => Math.ceil(weight / 4);
var stripCodeSeparator = (script) => {
  let start = 0;
  const out = [];
  for (let i = 0;i < script.length; ) {
    const pos = i;
    const op = script[i++];
    if (op === OP.CODESEPARATOR) {
      if (start < pos)
        out.push(script.subarray(start, pos));
      start = i;
      continue;
    }
    const len = scriptPushLen(op, (bytes) => {
      if (i + bytes > script.length)
        throw new Error("Unexpected end of script");
      let len = 0;
      for (let j = 0;j < bytes; j++)
        len |= script[i + j] << 8 * j;
      i += bytes;
      return len;
    });
    if (len === undefined)
      continue;
    i += len;
    if (i > script.length)
      throw new Error("Unexpected end of script");
  }
  if (start === 0)
    return script;
  if (start < script.length)
    out.push(script.subarray(start));
  return out.length ? concatBytes4(...out) : EMPTY;
};
var DEFAULT_VERSION = 2;
var DEFAULT_LOCKTIME = 0;
var DEFAULT_SEQUENCE = 4294967295;
var def = (value, def) => value === undefined ? def : value;
function cloneDeep(obj) {
  if (Array.isArray(obj))
    return obj.map((i) => cloneDeep(i));
  else if (isBytes5(obj))
    return Uint8Array.from(obj);
  else if (["number", "bigint", "boolean", "string", "undefined"].includes(typeof obj))
    return obj;
  else if (obj === null)
    return obj;
  else if (typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cloneDeep(v)]));
  }
  throw new Error(`cloneDeep: unknown type=${typeof obj}`);
}
var SignatureHash = /* @__PURE__ */ (() => Object.freeze({
  DEFAULT: 0,
  ALL: 1,
  NONE: 2,
  SINGLE: 3,
  ANYONECANPAY: 128
}))();
var SigHash = /* @__PURE__ */ (() => Object.freeze({
  DEFAULT: SignatureHash.DEFAULT,
  ALL: SignatureHash.ALL,
  NONE: SignatureHash.NONE,
  SINGLE: SignatureHash.SINGLE,
  ALL_ANYONECANPAY: SignatureHash.ALL | SignatureHash.ANYONECANPAY,
  NONE_ANYONECANPAY: SignatureHash.NONE | SignatureHash.ANYONECANPAY,
  SINGLE_ANYONECANPAY: SignatureHash.SINGLE | SignatureHash.ANYONECANPAY
}))();
var SigHashNames = /* @__PURE__ */ (() => Object.freeze(reverseObject(SigHash)))();
function getTaprootKeys(privKey, pubKey, internalKey, merkleRoot = EMPTY) {
  if (equalBytes2(internalKey, pubKey)) {
    privKey = taprootTweakPrivKey(privKey, merkleRoot);
    pubKey = pubSchnorr(privKey);
  }
  return { privKey, pubKey };
}
function outputBeforeSign(i) {
  if (i.script === undefined || i.amount === undefined)
    throw new Error("Transaction/output: script and amount required");
  return { script: i.script, amount: i.amount };
}
function inputBeforeSign(i) {
  validateObject2(i, {}, {}, "i");
  if (i.txid === undefined || i.index === undefined)
    throw new Error("Transaction/input: txid and index required");
  const res = {
    txid: i.txid,
    index: i.index,
    sequence: def(i.sequence, DEFAULT_SEQUENCE),
    finalScriptSig: def(i.finalScriptSig, EMPTY)
  };
  RawInput.encode(res);
  return res;
}
var cleanExtensions = (map, unknownMode, proprietaryMode, rejectStrip = false) => {
  const out = { ...map };
  for (const [name, mode] of [
    ["unknown", unknownMode],
    ["proprietary", proprietaryMode]
  ]) {
    const value = out[name];
    if (value !== undefined)
      aarray2(value, `${name} PSBT field`);
    const rows = value;
    if (!rows?.length) {
      delete out[name];
      continue;
    }
    if (mode === "strict")
      throw new Error(`PSBT: ${name} PSBT field is not allowed in strict mode`);
    if (mode === "strip") {
      if (rejectStrip)
        throw new Error(`PSBT: ${name} PSBT field cannot be supplied when policy is strip`);
      delete out[name];
    }
  }
  return out;
};
var cleanTxModifiable = (value, mode) => {
  if (value === undefined || !(value & ~7))
    return value;
  if (mode === "strict")
    throw new Error("PSBT: unknown txModifiable bits in strict mode");
  return mode === "strip" ? value & 7 : value;
};
function cleanFinalInput(i, unknownMode = "strip", proprietaryMode = "strip") {
  const _i = i;
  const extensions = cleanExtensions(_i, unknownMode, proprietaryMode);
  if (extensions.unknown)
    _i.unknown = extensions.unknown;
  else
    delete _i.unknown;
  if (extensions.proprietary)
    _i.proprietary = extensions.proprietary;
  else
    delete _i.proprietary;
  for (const _k in _i) {
    const k = _k;
    if (proprietaryMode === "ignore" && k === "proprietary" && _i.proprietary?.length)
      continue;
    if (!PSBTInputFinalKeys.includes(k))
      delete _i[k];
  }
}
var TxHashIdx = /* @__PURE__ */ (() => struct({ txid: createBytes(32, true), index: U32LE }))();
function validateSigHash(s) {
  if (typeof s !== "number" || typeof SigHashNames[s] !== "string")
    throw new Error(`Invalid SigHash=${s}`);
  return s;
}
function unpackSighash(hashType) {
  const masked = hashType & 31;
  return {
    isAny: !!(hashType & SignatureHash.ANYONECANPAY),
    isNone: masked === SignatureHash.NONE,
    isSingle: masked === SignatureHash.SINGLE
  };
}
var sighashScope = (sighash) => ({
  sigInputs: sighash & SignatureHash.ANYONECANPAY,
  sigOutputs: sighash === SignatureHash.DEFAULT ? SignatureHash.ALL : sighash & 3
});
var normalizeUnknowns = (name, mode, legacy, fallback = "strip") => {
  const alias = legacy === undefined ? undefined : legacy ? "ignore" : "strip";
  if (mode !== undefined && mode !== "ignore" && mode !== "strip" && mode !== "strict")
    throw new Error(`Transaction options wrong value: ${name}=${mode}`);
  if (mode !== undefined && alias !== undefined && mode !== alias)
    throw new Error(`Transaction options: conflicting ${name} options`);
  return mode || alias || fallback;
};
function validateOpts(opts) {
  if (opts !== undefined)
    validateObject2(opts, {}, {}, "opts");
  const _opts = {
    ...opts,
    version: def(opts.version, DEFAULT_VERSION),
    lockTime: def(opts.lockTime, 0),
    PSBTVersion: def(opts.PSBTVersion, 0)
  };
  if (typeof _opts.allowUnknowInput !== "undefined")
    _opts.allowUnknownInputs = _opts.allowUnknowInput;
  if (typeof _opts.allowUnknowOutput !== "undefined")
    _opts.allowUnknownOutputs = _opts.allowUnknowOutput;
  if (_opts.allowMissingTxModifiable === undefined)
    _opts.allowMissingTxModifiable = true;
  if (typeof _opts.lockTime !== "number")
    throw new Error("Transaction lock time should be number");
  U32LE.encode(_opts.lockTime);
  if (_opts.PSBTVersion !== 0 && _opts.PSBTVersion !== 2)
    throw new Error(`Unknown PSBT version ${_opts.PSBTVersion}`);
  for (const k of [
    "allowUnknownVersion",
    "allowUnknownOutputs",
    "allowUnknownInputs",
    "disableScriptCheck",
    "bip174jsCompat",
    "allowLegacyWitnessUtxo",
    "strictPrevoutValidation",
    "lowR",
    "allowUnknown",
    "allowMissingTxModifiable"
  ]) {
    const v = _opts[k];
    if (v === undefined)
      continue;
    if (typeof v !== "boolean")
      throw new Error(`Transation options wrong type: ${k}=${v} (${typeof v})`);
  }
  _opts.unknown = normalizeUnknowns("unknown", _opts.unknown, _opts.allowUnknown);
  _opts.proprietary = normalizeUnknowns("proprietary", _opts.proprietary, undefined, _opts.unknown);
  if (_opts.allowUnknownVersion ? typeof _opts.version !== "number" : ![-1, 0, 1, 2, 3].includes(_opts.version))
    throw new Error(`Unknown version: ${_opts.version}`);
  I32LE.encode(_opts.version);
  if (_opts.customScripts !== undefined) {
    const cs = _opts.customScripts;
    if (!Array.isArray(cs)) {
      throw new Error(`wrong custom scripts type (expected array): customScripts=${cs} (${typeof cs})`);
    }
    for (const s of cs) {
      if (typeof s.encode !== "function" || typeof s.decode !== "function")
        throw new Error(`wrong script=${s} (${typeof s})`);
      if (s.finalizeTaproot !== undefined && typeof s.finalizeTaproot !== "function")
        throw new Error(`wrong script=${s} (${typeof s})`);
    }
  }
  return Object.freeze(_opts);
}
function checkTaprootInputCommitments(input, prevScript) {
  const output = _WitnessOutScript.decode(prevScript);
  const hasTaprootCommitments = input.tapInternalKey !== undefined || input.tapMerkleRoot !== undefined || !!input.tapLeafScript?.length;
  if (output.type !== "tr") {
    if (hasTaprootCommitments)
      throw new Error("validateInput: Taproot metadata without P2TR previous output");
    return;
  }
  const checkOutputKey = (internalKey, merkleRoot, parity) => {
    const [outputKey, outputParity] = taprootTweakPubkey(internalKey, merkleRoot);
    if (!equalBytes2(outputKey, output.pubkey))
      throw new Error("validateInput: Taproot commitment does not match previous output");
    if (parity !== undefined && outputParity !== parity)
      throw new Error("validateInput: Taproot control-block parity does not match previous output");
  };
  if (input.tapLeafScript) {
    for (const [controlBlock, scriptWithVersion] of input.tapLeafScript) {
      const leafVersion = scriptWithVersion[scriptWithVersion.length - 1];
      const script = scriptWithVersion.subarray(0, -1);
      let merkleRoot = tapLeafHash(script, leafVersion);
      for (const sibling of controlBlock.merklePath) {
        merkleRoot = compareBytes(sibling, merkleRoot) === -1 ? tagSchnorr("TapBranch", sibling, merkleRoot) : tagSchnorr("TapBranch", merkleRoot, sibling);
      }
      checkOutputKey(controlBlock.internalKey, merkleRoot, controlBlock.version & 1);
      if (input.tapInternalKey && !equalBytes2(input.tapInternalKey, controlBlock.internalKey))
        throw new Error("validateInput: tapInternalKey does not match Taproot control block");
      if (input.tapMerkleRoot && !equalBytes2(input.tapMerkleRoot, merkleRoot))
        throw new Error("validateInput: tapMerkleRoot does not match Taproot control block");
    }
  }
  if (input.tapInternalKey && (input.tapMerkleRoot || !input.tapLeafScript?.length))
    checkOutputKey(input.tapInternalKey, input.tapMerkleRoot || EMPTY);
}
var LOCKTIME_THRESHOLD = 500000000;
function validateRequiredLocktimes(input) {
  const height = input.requiredHeightLocktime;
  if (height !== undefined) {
    anumber(height, "requiredHeightLocktime");
    if (height === 0 || height >= LOCKTIME_THRESHOLD)
      throw new RangeError(`requiredHeightLocktime must be between 1 and ${LOCKTIME_THRESHOLD - 1}, got ${height}`);
  }
  const time = input.requiredTimeLocktime;
  if (time !== undefined) {
    anumber(time, "requiredTimeLocktime");
    if (time < LOCKTIME_THRESHOLD || time > 4294967295)
      throw new RangeError(`requiredTimeLocktime must be between ${LOCKTIME_THRESHOLD} and 4294967295, got ${time}`);
  }
}
function resolvePSBTLocktime(inputs, fallback = DEFAULT_LOCKTIME) {
  let height = DEFAULT_LOCKTIME;
  let time = DEFAULT_LOCKTIME;
  let hasRequirements = false;
  let heightSupported = true;
  let timeSupported = true;
  for (const input of inputs) {
    validateRequiredLocktimes(input);
    const hasHeight = input.requiredHeightLocktime !== undefined;
    const hasTime = input.requiredTimeLocktime !== undefined;
    if (!hasHeight && !hasTime)
      continue;
    hasRequirements = true;
    if (hasHeight)
      height = Math.max(height, input.requiredHeightLocktime);
    else
      heightSupported = false;
    if (hasTime)
      time = Math.max(time, input.requiredTimeLocktime);
    else
      timeSupported = false;
  }
  if (!hasRequirements)
    return fallback;
  if (heightSupported)
    return height;
  if (timeSupported)
    return time;
  throw new Error("PSBTv2: incompatible height-based and time-based locktime requirements");
}
function validateInput(i, disableScriptCheck = false) {
  validateObject2(i, {}, {}, "i");
  const _i = i;
  validateRequiredLocktimes(_i);
  let prevOut;
  if (_i.nonWitnessUtxo && _i.index !== undefined) {
    const last = _i.nonWitnessUtxo.outputs.length - 1;
    if (_i.index > last)
      throw new Error(`validateInput: index(${_i.index}) not in nonWitnessUtxo`);
    prevOut = _i.nonWitnessUtxo.outputs[_i.index];
    if (_i.witnessUtxo && (!equalBytes2(_i.witnessUtxo.script, prevOut.script) || _i.witnessUtxo.amount !== prevOut.amount))
      throw new Error("validateInput: witnessUtxo different from nonWitnessUtxo");
    if (_i.txid) {
      const outputs = _i.nonWitnessUtxo.outputs;
      if (outputs.length - 1 < _i.index)
        throw new Error("nonWitnessUtxo: incorect output index");
      const tx = Transaction.fromRaw(RawTx.encode(_i.nonWitnessUtxo), {
        allowUnknownOutputs: true,
        disableScriptCheck: true,
        allowUnknownInputs: true,
        allowUnknownVersion: true
      });
      const txid = hex.encode(_i.txid);
      if (tx.id !== txid)
        throw new Error(`nonWitnessUtxo: wrong txid, exp=${txid} got=${tx.id}`);
    }
  } else if (_i.witnessUtxo)
    prevOut = _i.witnessUtxo;
  if (prevOut && !disableScriptCheck) {
    checkScript(prevOut.script, _i.redeemScript, _i.witnessScript);
    checkTaprootInputCommitments(_i, prevOut.script);
  }
  return _i;
}
var inputSignatures = (input) => {
  const _input = input;
  const res = [];
  const add = (signature, taproot, scriptPath = false) => {
    const sig = signature;
    if (!sig.length)
      return;
    const sighash = taproot && sig.length === 64 ? SignatureHash.DEFAULT : sig[sig.length - 1];
    res.push({ sighash, taproot, scriptPath });
  };
  for (const [, signature] of _input.partialSig || [])
    add(signature, false);
  if (_input.tapKeySig)
    add(_input.tapKeySig, true);
  for (const [, signature] of _input.tapScriptSig || [])
    add(signature, true, true);
  return res;
};
var inputSignedKeys = {
  self: ["txid", "index", "sequence", "nonWitnessUtxo", "witnessUtxo", "sighashType"],
  ecdsa: ["redeemScript", "witnessScript"],
  tapscript: ["tapLeafScript"],
  cross: ["txid", "index"],
  prevout: ["nonWitnessUtxo", "witnessUtxo"]
};
function getPrevOut(input) {
  validateObject2(input, {}, {}, "input");
  const _input = input;
  if (_input.nonWitnessUtxo) {
    if (_input.index === undefined)
      throw new Error("Unknown input index");
    if (!Number.isSafeInteger(_input.index) || _input.index < 0 || _input.index >= _input.nonWitnessUtxo.outputs.length)
      throw new Error(`Wrong input index=${_input.index}`);
    return _input.nonWitnessUtxo.outputs[_input.index];
  } else if ("witnessUtxo" in _input) {
    const prev = _input.witnessUtxo;
    validateObject2(prev, {}, {}, "input.witnessUtxo");
    abigint(prev.amount, "input.witnessUtxo.amount");
    if (!isBytes5(prev.script))
      throw new TypeError('"input.witnessUtxo.script" expected Uint8Array, got type=' + typeof prev.script);
    return prev;
  } else
    throw new Error("Cannot find previous output info");
}
function normalizeInput(i, cur, allowedFields, disableScriptCheck = false, unknown = "strip", proprietary = "strip") {
  validateObject2(i, {}, {}, "i");
  if (cur !== undefined)
    validateObject2(cur, {}, {}, "cur");
  if (allowedFields !== undefined)
    aarray2(allowedFields, "allowedFields");
  const _i = i;
  const _cur = cur;
  const _allowedFields = allowedFields;
  let { nonWitnessUtxo, txid } = _i;
  if (typeof nonWitnessUtxo === "string")
    nonWitnessUtxo = hex.decode(nonWitnessUtxo);
  if (isBytes5(nonWitnessUtxo))
    nonWitnessUtxo = RawTx.decode(nonWitnessUtxo);
  if (!("nonWitnessUtxo" in _i) && nonWitnessUtxo === undefined)
    nonWitnessUtxo = _cur?.nonWitnessUtxo;
  if (typeof txid === "string")
    txid = hex.decode(txid);
  if (txid === undefined)
    txid = _cur?.txid;
  let res = { ..._cur, ..._i, nonWitnessUtxo, txid };
  if (!("nonWitnessUtxo" in _i) && res.nonWitnessUtxo === undefined)
    delete res.nonWitnessUtxo;
  if (res.sequence === undefined)
    res.sequence = DEFAULT_SEQUENCE;
  if (res.tapMerkleRoot === null)
    delete res.tapMerkleRoot;
  res = mergeKeyMap(PSBTInput, res, _cur, _allowedFields, unknown, proprietary);
  if (Array.isArray(res.tapLeafScript) && !res.tapLeafScript.length)
    delete res.tapLeafScript;
  validateRequiredLocktimes(res);
  PSBTInputCoder.encode(res);
  return validateInput(res, disableScriptCheck);
}
function getInputType(input, allowLegacyWitnessUtxo = false) {
  const _input = input;
  let txType = "legacy";
  let defaultSighash = SignatureHash.ALL;
  const prevOut = getPrevOut(_input);
  const first = _WitnessOutScript.decode(prevOut.script);
  let type = first.type;
  let cur = first;
  const stack = [first];
  let lastScript = prevOut.script;
  if (first.type === "tr") {
    defaultSighash = SignatureHash.DEFAULT;
    return {
      txType: "taproot",
      type: "tr",
      last: first,
      lastScript: prevOut.script,
      defaultSighash,
      sighash: _input.sighashType || defaultSighash
    };
  } else {
    if (first.type === "wpkh" || first.type === "wsh")
      txType = "segwit";
    if (first.type === "sh") {
      if (!_input.redeemScript)
        throw new Error("inputType: sh without redeemScript");
      let child = _WitnessOutScript.decode(_input.redeemScript);
      if (child.type === "wpkh" || child.type === "wsh")
        txType = "segwit";
      stack.push(child);
      cur = child;
      lastScript = _input.redeemScript;
      type += `-${child.type}`;
    }
    if (cur.type === "wsh") {
      if (!_input.witnessScript)
        throw new Error("inputType: wsh without witnessScript");
      let child = OutScript.decode(_input.witnessScript);
      if (child.type === "wsh")
        txType = "segwit";
      stack.push(child);
      cur = child;
      lastScript = _input.witnessScript;
      type += `-${child.type}`;
    }
    const last = stack[stack.length - 1];
    if (last.type === "sh" || last.type === "wsh")
      throw new Error("inputType: sh/wsh cannot be terminal type");
    const res = {
      type,
      txType,
      last,
      lastScript,
      defaultSighash,
      sighash: _input.sighashType || defaultSighash
    };
    if (txType === "legacy" && !allowLegacyWitnessUtxo && !_input.nonWitnessUtxo) {
      throw new Error(`Transaction/sign: legacy input without nonWitnessUtxo, can result in attack that forces paying higher fees. Pass allowLegacyWitnessUtxo=true, if you sure`);
    }
    return res;
  }
}

class Transaction {
  global = {};
  inputs = [];
  outputs = [];
  opts;
  constructor(opts = {}) {
    const _opts = this.opts = validateOpts(opts);
    this.global.fallbackLocktime = _opts.lockTime;
    this.global.txVersion = _opts.version;
    if (_opts.PSBTVersion === 2)
      this.global.txModifiable = 3;
  }
  isPSBTv2() {
    return (this.global.version ?? this.opts.PSBTVersion) === 2;
  }
  requireTxModifiable(bit, kind) {
    if (!this.isPSBTv2())
      return;
    if (!(this.txModifiablePolicy() & bit))
      throw new Error(`PSBTv2: ${kind} are not modifiable`);
  }
  txModifiablePolicy(allowMissing = this.opts.allowMissingTxModifiable, unknownMode = this.opts.unknown) {
    if (!this.isPSBTv2())
      return 3;
    if (this.global.txModifiable !== undefined)
      return cleanTxModifiable(this.global.txModifiable, unknownMode);
    return allowMissing ? 3 : 0;
  }
  modifiable(allowMissing = this.opts.allowMissingTxModifiable, unknownMode = this.opts.unknown) {
    let flags = this.txModifiablePolicy(allowMissing, unknownMode);
    let hasOpaqueFinal = false;
    let hasSingle = false;
    for (let idx = 0;idx < this.inputs.length; idx++) {
      const signatures = inputSignatures(this.inputs[idx]);
      if (!signatures.length && this.inputStatus(idx) === "finalized")
        hasOpaqueFinal = true;
      for (const { sighash } of signatures) {
        const { isAny, isNone, isSingle } = unpackSighash(sighash);
        if (!isAny)
          flags &= ~1;
        if (!isNone)
          flags &= ~2;
        if (isSingle)
          hasSingle = true;
      }
    }
    if (hasSingle)
      flags |= 4;
    if (hasOpaqueFinal && this.global.txModifiable === undefined)
      flags &= ~3;
    return flags;
  }
  get txModifiable() {
    return this.modifiable();
  }
  static fromRaw(raw, opts = {}) {
    const parsed = RawTx.decode(raw);
    const tx = new Transaction({ ...opts, version: parsed.version, lockTime: parsed.lockTime });
    for (const o of parsed.outputs)
      tx.addOutput(o);
    tx.outputs = parsed.outputs;
    tx.inputs = parsed.inputs;
    if (parsed.witnesses) {
      for (let i = 0;i < parsed.witnesses.length; i++)
        tx.inputs[i].finalScriptWitness = parsed.witnesses[i];
    }
    return tx;
  }
  static fromPSBT(psbt_, opts = {}) {
    let parsed;
    try {
      parsed = RawPSBTV0.decode(psbt_);
    } catch (e0) {
      try {
        parsed = RawPSBTV2.decode(psbt_);
      } catch (e2) {
        throw e0;
      }
    }
    const PSBTVersion = parsed.global.version || 0;
    if (PSBTVersion !== 0 && PSBTVersion !== 2)
      throw new Error(`Wrong PSBT version=${PSBTVersion}`);
    const unsigned = parsed.global.unsignedTx;
    const version = PSBTVersion === 0 ? unsigned?.version : parsed.global.txVersion;
    const lockTime = PSBTVersion === 0 ? unsigned?.lockTime : parsed.global.fallbackLocktime;
    const tx = new Transaction({ ...opts, version, lockTime, PSBTVersion });
    const inputCount = PSBTVersion === 0 ? unsigned?.inputs.length : parsed.global.inputCount;
    tx.inputs = parsed.inputs.slice(0, inputCount).map((i, j) => {
      const input = {
        ...parsed.global.unsignedTx?.inputs[j],
        ...i
      };
      if (!i.finalScriptSig?.length)
        delete input.finalScriptSig;
      return validateInput(input, tx.opts.disableScriptCheck);
    });
    const outputCount = PSBTVersion === 0 ? unsigned?.outputs.length : parsed.global.outputCount;
    const hasBip174InputMap = PSBTVersion === 0 && inputCount === 0 && Object.keys(parsed.outputs[0] || {}).length === 0 && (outputCount > 0 && parsed.outputs.length === outputCount + 1 || outputCount === 0 && parsed.outputs.length === 2 && Object.keys(parsed.outputs[1]).length === 0);
    const outputStart = hasBip174InputMap ? 1 : 0;
    tx.outputs = parsed.outputs.slice(outputStart, outputStart + outputCount).map((i, j) => ({
      ...i,
      ...parsed.global.unsignedTx?.outputs[j]
    }));
    const unknownMode = tx.opts.unknown;
    const proprietaryMode = tx.opts.proprietary;
    tx.global = cleanExtensions({ ...parsed.global, txVersion: version }, unknownMode, proprietaryMode);
    tx.inputs = tx.inputs.map((input) => cleanExtensions(input, unknownMode, proprietaryMode));
    tx.outputs = tx.outputs.map((output) => cleanExtensions(output, unknownMode, proprietaryMode));
    if (tx.global.txModifiable !== undefined)
      tx.global.txModifiable = cleanTxModifiable(tx.global.txModifiable, unknownMode);
    resolvePSBTLocktime(tx.inputs, tx.global.fallbackLocktime ?? DEFAULT_LOCKTIME);
    if (PSBTVersion === 0)
      tx.global.fallbackLocktime = def(lockTime, DEFAULT_LOCKTIME);
    return tx;
  }
  toPSBT(PSBTVersion = this.global.version || this.opts.PSBTVersion) {
    if (PSBTVersion !== undefined)
      anumber(PSBTVersion, "PSBTVersion");
    if (PSBTVersion !== 0 && PSBTVersion !== 2)
      throw new Error(`Wrong PSBT version=${PSBTVersion}`);
    const inputs = this.inputs.map((i) => cleanExtensions(cleanPSBTFields(PSBTVersion, PSBTInput, validateInput(i, this.opts.disableScriptCheck)), this.opts.unknown, this.opts.proprietary));
    for (const inp of inputs) {
      if (inp.partialSig && !inp.partialSig.length)
        delete inp.partialSig;
      if (inp.finalScriptSig && !inp.finalScriptSig.length)
        delete inp.finalScriptSig;
      if (inp.finalScriptWitness && !inp.finalScriptWitness.length)
        delete inp.finalScriptWitness;
    }
    const outputs = this.outputs.map((i) => cleanExtensions(cleanPSBTFields(PSBTVersion, PSBTOutput, i), this.opts.unknown, this.opts.proprietary));
    const global = cleanExtensions({ ...this.global }, this.opts.unknown, this.opts.proprietary);
    if (global.txModifiable !== undefined)
      global.txModifiable = cleanTxModifiable(global.txModifiable, this.opts.unknown);
    if (PSBTVersion === 0) {
      global.unsignedTx = RawOldTx.decode(RawOldTx.encode({
        version: this.version,
        lockTime: this.lockTime,
        inputs: this.inputs.map((i) => inputBeforeSign(i)).map((i) => ({
          ...i,
          finalScriptSig: EMPTY
        })),
        outputs: this.outputs.map((o) => outputBeforeSign(o))
      }));
      delete global.fallbackLocktime;
      delete global.txVersion;
      delete global.inputCount;
      delete global.outputCount;
      delete global.version;
      delete global.txModifiable;
    } else {
      delete global.unsignedTx;
      global.version = PSBTVersion;
      global.txVersion = this.version;
      global.inputCount = this.inputs.length;
      global.outputCount = this.outputs.length;
      if (!this.isPSBTv2() || global.txModifiable === undefined && this.opts.allowMissingTxModifiable)
        global.txModifiable = this.txModifiable;
    }
    if (this.opts.bip174jsCompat && PSBTVersion === 0 && !outputs.length)
      outputs.push({});
    const raw = { global, inputs, outputs };
    return PSBTVersion === 0 ? RawPSBTV0.encode(raw) : RawPSBTV2.encode(raw);
  }
  get lockTime() {
    return resolvePSBTLocktime(this.inputs, this.global.fallbackLocktime ?? DEFAULT_LOCKTIME);
  }
  get version() {
    if (this.global.txVersion === undefined)
      throw new Error("No global.txVersion");
    return this.global.txVersion;
  }
  inputStatus(idx) {
    this.checkInputIdx(idx);
    const input = this.inputs[idx];
    if (input.finalScriptSig && input.finalScriptSig.length)
      return "finalized";
    if (input.finalScriptWitness && input.finalScriptWitness.length)
      return "finalized";
    if (input.tapKeySig)
      return "signed";
    if (input.tapScriptSig && input.tapScriptSig.length)
      return "signed";
    if (input.partialSig && input.partialSig.length)
      return "signed";
    return "unsigned";
  }
  cleanFinalInput(input) {
    cleanFinalInput(input, this.opts.unknown, this.opts.proprietary);
    if (this.global.txModifiable !== undefined)
      this.global.txModifiable = cleanTxModifiable(this.global.txModifiable, this.opts.unknown);
  }
  inputSighash(idx) {
    this.checkInputIdx(idx);
    const inputSighash = this.inputs[idx].sighashType;
    const sighash = inputSighash === undefined ? SignatureHash.DEFAULT : inputSighash;
    return sighashScope(sighash);
  }
  signatures() {
    const res = [];
    for (let idx = 0;idx < this.inputs.length; idx++) {
      const actual = inputSignatures(this.inputs[idx]);
      for (const signature of actual)
        res.push({ idx, ...signature });
      if (actual.length || this.inputStatus(idx) !== "finalized")
        continue;
      let taproot = true;
      try {
        taproot = _WitnessOutScript.decode(getPrevOut(this.inputs[idx]).script).type === "tr";
      } catch {}
      const declared = this.inputs[idx].sighashType;
      const sighash = declared === undefined ? SignatureHash.DEFAULT : declared;
      res.push({ idx, sighash, taproot, scriptPath: taproot });
    }
    return res;
  }
  signedInputKeys(idx, signatures = this.signatures()) {
    const res = new Set;
    const add = (keys) => {
      for (const key of keys)
        res.add(key);
    };
    for (const signature of signatures) {
      const { isAny, isNone, isSingle } = unpackSighash(signature.sighash);
      if (signature.idx === idx) {
        add(inputSignedKeys.self);
        if (signature.taproot) {
          if (signature.scriptPath)
            add(inputSignedKeys.tapscript);
        } else
          add(inputSignedKeys.ecdsa);
      } else if (!isAny) {
        add(inputSignedKeys.cross);
        if (signature.taproot || !isNone && !isSingle)
          res.add("sequence");
        if (signature.taproot)
          add(inputSignedKeys.prevout);
      }
    }
    return [...res];
  }
  signStatus(signatures = this.signatures()) {
    let addInput = true, addOutput = true;
    let inputs = [], outputs = [];
    for (const { idx, sighash } of signatures) {
      const { sigInputs, sigOutputs } = sighashScope(sighash);
      if (sigInputs === SignatureHash.ANYONECANPAY) {
        if (!inputs.includes(idx))
          inputs.push(idx);
      } else
        addInput = false;
      if (sigOutputs === SignatureHash.ALL)
        addOutput = false;
      else if (sigOutputs === SignatureHash.SINGLE) {
        if (!outputs.includes(idx))
          outputs.push(idx);
      } else if (sigOutputs === SignatureHash.NONE) {} else
        throw new Error(`Wrong signature hash output type: ${sigOutputs}`);
    }
    return { addInput, addOutput, inputs, outputs };
  }
  get isFinal() {
    for (let idx = 0;idx < this.inputs.length; idx++)
      if (this.inputStatus(idx) !== "finalized")
        return false;
    return true;
  }
  get hasWitnesses() {
    for (const i of this.inputs)
      if (i.finalScriptWitness && i.finalScriptWitness.length)
        return true;
    return false;
  }
  get weight() {
    if (!this.isFinal)
      throw new Error("Transaction is not finalized");
    const varLen = (dataLen) => CompactSizeLen.encode(dataLen).length + dataLen;
    const hasWitnesses = this.hasWitnesses;
    let out = 32;
    const outputs = this.outputs.map(outputBeforeSign);
    out += 4 * CompactSizeLen.encode(this.outputs.length).length;
    for (const o of outputs)
      out += 32 + 4 * varLen(o.script.length);
    if (hasWitnesses)
      out += 2;
    out += 4 * CompactSizeLen.encode(this.inputs.length).length;
    for (const i of this.inputs) {
      out += 160 + 4 * varLen((i.finalScriptSig || EMPTY).length);
      if (hasWitnesses) {
        const witness = i.finalScriptWitness || [];
        out += CompactSizeLen.encode(witness.length).length;
        for (const w of witness)
          out += varLen(w.length);
      }
    }
    return out;
  }
  get vsize() {
    return toVsize(this.weight);
  }
  toBytes(withScriptSig = false, withWitness = false) {
    return RawTx.encode({
      version: this.version,
      lockTime: this.lockTime,
      inputs: this.inputs.map(inputBeforeSign).map((i) => ({
        ...i,
        finalScriptSig: withScriptSig && i.finalScriptSig || EMPTY
      })),
      outputs: this.outputs.map(outputBeforeSign),
      witnesses: this.inputs.map((i) => i.finalScriptWitness || []),
      segwitFlag: withWitness && this.hasWitnesses
    });
  }
  get unsignedTx() {
    return this.toBytes(false, false);
  }
  get hex() {
    return hex.encode(this.toBytes(true, this.hasWitnesses));
  }
  get hash() {
    return hex.encode(sha256x2(this.toBytes(true)));
  }
  get id() {
    return hex.encode(sha256x2(this.toBytes(true)).reverse());
  }
  checkInputIdx(idx) {
    anumber(idx, "idx");
    if (idx >= this.inputs.length)
      throw new Error(`Wrong input index=${idx}`);
  }
  validatePrevoutsForSigning() {
    if (!this.opts.strictPrevoutValidation)
      return;
    for (let i = 0;i < this.inputs.length; i++) {
      const input = this.inputs[i];
      if (!input.nonWitnessUtxo) {
        throw new Error(`Transaction/sign: strictPrevoutValidation requires nonWitnessUtxo for input=${i}`);
      }
      if (input.txid === undefined || input.index === undefined) {
        throw new Error(`Transaction/sign: strictPrevoutValidation requires an outpoint for input=${i}`);
      }
      validateInput(input, this.opts.disableScriptCheck);
    }
  }
  getInput(idx) {
    this.checkInputIdx(idx);
    return cloneDeep(this.inputs[idx]);
  }
  get inputsLength() {
    return this.inputs.length;
  }
  addInput(input, _ignoreSignStatus = false) {
    validateObject2(input, {}, {}, "input");
    cleanExtensions(input, this.opts.unknown, this.opts.proprietary, true);
    this.requireTxModifiable(1, "inputs");
    const signatures = _ignoreSignStatus ? undefined : this.signatures();
    const status = signatures && this.signStatus(signatures);
    if (status && !status.addInput)
      throw new Error("Tx has signed inputs, cannot add new one");
    const normalized = cloneDeep(normalizeInput(input, undefined, undefined, this.opts.disableScriptCheck, this.opts.unknown, this.opts.proprietary));
    const nextLockTime = resolvePSBTLocktime([...this.inputs, normalized], this.global.fallbackLocktime ?? DEFAULT_LOCKTIME);
    if (signatures?.length && nextLockTime !== this.lockTime)
      throw new Error("Tx has signed inputs, cannot change lockTime");
    this.inputs.push(normalized);
    return this.inputs.length - 1;
  }
  updateInput(idx, input, _ignoreSignStatus = false) {
    this.checkInputIdx(idx);
    cleanExtensions(input, this.opts.unknown, this.opts.proprietary, true);
    let allowedFields;
    const signatures = _ignoreSignStatus ? undefined : this.signatures();
    if (signatures?.length) {
      if (this.inputStatus(idx) === "finalized") {
        allowedFields = PSBTInputSignatureKeys.filter((key) => this.inputs[idx][key] !== undefined);
      } else {
        const signed = new Set(this.signedInputKeys(idx, signatures));
        if (signed.size)
          allowedFields = Object.keys(PSBTInput).filter((key) => !signed.has(key));
      }
    }
    const normalized = cloneDeep(normalizeInput(input, this.inputs[idx], allowedFields, this.opts.disableScriptCheck, this.opts.unknown, this.opts.proprietary));
    const inputs = this.inputs.slice();
    inputs[idx] = normalized;
    const nextLockTime = resolvePSBTLocktime(inputs, this.global.fallbackLocktime ?? DEFAULT_LOCKTIME);
    if (signatures?.length && nextLockTime !== this.lockTime)
      throw new Error("Tx has signed inputs, cannot change lockTime");
    const current = this.inputs[idx];
    const transactionChanged = current.index !== normalized.index || def(current.sequence, DEFAULT_SEQUENCE) !== def(normalized.sequence, DEFAULT_SEQUENCE) || (current.txid === undefined ? normalized.txid !== undefined : normalized.txid === undefined || !equalBytes2(current.txid, normalized.txid)) || nextLockTime !== this.lockTime;
    if (transactionChanged)
      this.requireTxModifiable(1, "inputs");
    this.inputs[idx] = normalized;
  }
  checkOutputIdx(idx) {
    anumber(idx, "idx");
    if (idx >= this.outputs.length)
      throw new Error(`Wrong output index=${idx}`);
  }
  getOutput(idx) {
    this.checkOutputIdx(idx);
    return cloneDeep(this.outputs[idx]);
  }
  getOutputAddress(idx, network = NETWORK) {
    const out = this.getOutput(idx);
    if (!out.script)
      return;
    return Address(network).encode(_WitnessOutScript.decode(out.script));
  }
  get outputsLength() {
    return this.outputs.length;
  }
  normalizeOutput(o, cur, allowedFields) {
    validateObject2(o, {}, {}, "o");
    let { amount, script } = o;
    if (amount === undefined)
      amount = cur?.amount;
    amount = abigint(amount, "o.amount");
    if (typeof script === "string")
      script = hex.decode(script);
    if (script === undefined)
      script = cur?.script;
    let res = { ...cur, ...o, amount, script };
    if (res.amount === undefined)
      delete res.amount;
    res = mergeKeyMap(PSBTOutput, res, cur, allowedFields, this.opts.unknown, this.opts.proprietary);
    PSBTOutputCoder.encode(res);
    if (res.script && !this.opts.allowUnknownOutputs && _WitnessOutScript.decode(res.script).type === "unknown") {
      throw new Error("Transaction/output: unknown output script type, there is a chance that input is unspendable. Pass allowUnknownOutputs=true, if you sure");
    }
    if (!this.opts.disableScriptCheck)
      checkScript(res.script, res.redeemScript, res.witnessScript);
    return res;
  }
  addOutput(o, _ignoreSignStatus = false) {
    cleanExtensions(o, this.opts.unknown, this.opts.proprietary, true);
    this.requireTxModifiable(2, "outputs");
    const status = _ignoreSignStatus ? undefined : this.signStatus();
    if (status && (!status.addOutput || status.outputs.includes(this.outputs.length)))
      throw new Error("Tx has signed outputs, cannot add new one");
    this.outputs.push(cloneDeep(this.normalizeOutput(o)));
    return this.outputs.length - 1;
  }
  updateOutput(idx, output, _ignoreSignStatus = false) {
    this.checkOutputIdx(idx);
    cleanExtensions(output, this.opts.unknown, this.opts.proprietary, true);
    let allowedFields = undefined;
    if (!_ignoreSignStatus) {
      const status = this.signStatus();
      if (!status.addOutput || status.outputs.includes(idx))
        allowedFields = PSBTOutputUnsignedKeys;
    }
    const current = this.outputs[idx];
    const normalized = cloneDeep(this.normalizeOutput(output, current, allowedFields));
    const transactionChanged = current.amount !== normalized.amount || (current.script === undefined ? normalized.script !== undefined : normalized.script === undefined || !equalBytes2(current.script, normalized.script));
    if (transactionChanged)
      this.requireTxModifiable(2, "outputs");
    this.outputs[idx] = normalized;
  }
  addOutputAddress(address, amount, network = NETWORK) {
    return this.addOutput({
      script: OutScript.encode(Address(network).decode(address)),
      amount
    });
  }
  get fee() {
    let res = _0n11;
    for (const i of this.inputs) {
      const prevOut = getPrevOut(i);
      if (!prevOut)
        throw new Error("Empty input amount");
      res += prevOut.amount;
    }
    const outputs = this.outputs.map(outputBeforeSign);
    for (const o of outputs)
      res -= o.amount;
    return res;
  }
  preimageLegacy(idx, prevOutScript, hashType) {
    const { isAny, isNone, isSingle } = unpackSighash(hashType);
    if (idx < 0 || !Number.isSafeInteger(idx))
      throw new Error(`Invalid input idx=${idx}`);
    if (isSingle && idx >= this.outputs.length || idx >= this.inputs.length)
      return U256LE.encode(_1n8);
    prevOutScript = stripCodeSeparator(prevOutScript);
    let inputs = this.inputs.map(inputBeforeSign).map((input, inputIdx) => ({
      ...input,
      finalScriptSig: inputIdx === idx ? prevOutScript : EMPTY
    }));
    if (isAny)
      inputs = [inputs[idx]];
    else if (isNone || isSingle) {
      inputs = inputs.map((input, inputIdx) => ({
        ...input,
        sequence: inputIdx === idx ? input.sequence : 0
      }));
    }
    let outputs = this.outputs.map(outputBeforeSign);
    if (isNone)
      outputs = [];
    else if (isSingle) {
      outputs = outputs.slice(0, idx).fill(EMPTY_OUTPUT).concat([outputs[idx]]);
    }
    const tmpTx = RawTx.encode({
      lockTime: this.lockTime,
      version: this.version,
      segwitFlag: false,
      inputs,
      outputs
    });
    return sha256x2(tmpTx, I32LE.encode(hashType));
  }
  preimageWitnessV0(idx, prevOutScript, hashType, amount) {
    anumber(idx, "idx");
    if (idx >= this.inputs.length)
      throw new Error(`Invalid input idx=${idx}`);
    const { isAny, isNone, isSingle } = unpackSighash(hashType);
    let inputHash = EMPTY32;
    let sequenceHash = EMPTY32;
    let outputHash = EMPTY32;
    const inputs = this.inputs.map(inputBeforeSign);
    const outputs = this.outputs.map(outputBeforeSign);
    if (!isAny)
      inputHash = sha256x2(...inputs.map(TxHashIdx.encode));
    if (!isAny && !isSingle && !isNone)
      sequenceHash = sha256x2(...inputs.map((i) => U32LE.encode(i.sequence)));
    if (!isSingle && !isNone) {
      outputHash = sha256x2(...outputs.map(RawOutput.encode));
    } else if (isSingle && idx < outputs.length)
      outputHash = sha256x2(RawOutput.encode(outputs[idx]));
    const input = inputs[idx];
    return sha256x2(I32LE.encode(this.version), inputHash, sequenceHash, createBytes(32, true).encode(input.txid), U32LE.encode(input.index), VarBytes.encode(prevOutScript), U64LE.encode(amount), U32LE.encode(input.sequence), outputHash, U32LE.encode(this.lockTime), U32LE.encode(hashType));
  }
  preimageWitnessV1(idx, prevOutScript, hashType, amount, codeSeparator = -1, leafScript, leafVer = 192, annex) {
    anumber(idx, "idx");
    if (idx >= this.inputs.length)
      throw new Error(`Invalid input idx=${idx}`);
    aarray2(amount, "amount");
    aarray2(prevOutScript, "prevOutScript");
    if (this.inputs.length !== amount.length)
      throw new Error(`Invalid amounts array=${amount}`);
    if (this.inputs.length !== prevOutScript.length)
      throw new Error(`Invalid prevOutScript array=${prevOutScript}`);
    const out = [
      U8.encode(0),
      U8.encode(hashType),
      I32LE.encode(this.version),
      U32LE.encode(this.lockTime)
    ];
    const outType = hashType === SignatureHash.DEFAULT ? SignatureHash.ALL : hashType & 3;
    const inType = hashType & SignatureHash.ANYONECANPAY;
    const inputs = this.inputs.map(inputBeforeSign);
    const outputs = this.outputs.map(outputBeforeSign);
    if (outType === SignatureHash.SINGLE && idx >= outputs.length) {
      throw new Error(`Input with sighash SINGLE, but there is no output with corresponding index=${idx}`);
    }
    if (inType !== SignatureHash.ANYONECANPAY) {
      out.push(...[
        inputs.map(TxHashIdx.encode),
        amount.map(U64LE.encode),
        prevOutScript.map(VarBytes.encode),
        inputs.map((i) => U32LE.encode(i.sequence))
      ].map((i) => sha2562(concatBytes4(...i))));
    }
    if (outType === SignatureHash.ALL) {
      out.push(sha2562(concatBytes4(...outputs.map(RawOutput.encode))));
    }
    const spendType = (annex ? 1 : 0) | (leafScript ? 2 : 0);
    out.push(new Uint8Array([spendType]));
    if (inType === SignatureHash.ANYONECANPAY) {
      const inp = inputs[idx];
      out.push(TxHashIdx.encode(inp), U64LE.encode(amount[idx]), VarBytes.encode(prevOutScript[idx]), U32LE.encode(inp.sequence));
    } else
      out.push(U32LE.encode(idx));
    if (spendType & 1)
      out.push(sha2562(VarBytes.encode(annex || EMPTY)));
    if (outType === SignatureHash.SINGLE)
      out.push(sha2562(RawOutput.encode(outputs[idx])));
    if (leafScript)
      out.push(tapLeafHash(leafScript, leafVer), U8.encode(0), I32LE.encode(codeSeparator));
    return tagSchnorr("TapSighash", ...out);
  }
  signIdx(privateKey, idx, allowedSighash, _auxRand) {
    if (!isBytes5(privateKey)) {
      if (!privateKey || typeof privateKey !== "object" || typeof privateKey.deriveChild !== "function")
        throw new TypeError('"privateKey" expected Uint8Array or HDKey, got type=' + typeof privateKey);
    }
    this.checkInputIdx(idx);
    this.validatePrevoutsForSigning();
    const input = validateInput(this.inputs[idx], this.opts.disableScriptCheck);
    const inputType = getInputType(input, this.opts.allowLegacyWitnessUtxo);
    const canSign = (privateKey) => {
      if (inputType.txType === "taproot") {
        const pubKey = pubSchnorr(privateKey);
        if (input.tapInternalKey && equalBytes2(pubKey, input.tapInternalKey))
          return true;
        if (!input.tapLeafScript)
          return false;
        for (const [_, leaf] of input.tapLeafScript) {
          for (const op of Script.decode(leaf.subarray(0, -1))) {
            if (isBytes5(op) && equalBytes2(op, pubKey))
              return true;
          }
        }
        return false;
      }
      const pubKey = pubECDSA(privateKey);
      const pubKeyHash = hash1602(pubKey);
      for (const op of Script.decode(inputType.lastScript)) {
        if (isBytes5(op) && (equalBytes2(op, pubKey) || equalBytes2(op, pubKeyHash)))
          return true;
      }
      return false;
    };
    if (!isBytes5(privateKey)) {
      const root = privateKey;
      const deriveSigners = (label, rows, pubKey) => {
        if (!rows || !rows.length)
          throw new Error(`${label}: empty`);
        const signers = rows.filter((row) => row.fingerprint == root.fingerprint).map((row) => {
          let s = root;
          for (const i of row.path)
            s = s.deriveChild(i);
          if (!equalBytes2(pubKey(s), row.pubKey))
            throw new Error(`${label}: wrong pubKey`);
          if (!s.privateKey)
            throw new Error(`${label}: no privateKey`);
          return s;
        });
        if (!signers.length)
          throw new Error(`${label}: no items with fingerprint=${root.fingerprint}`);
        return signers;
      };
      const signers = inputType.txType === "taproot" ? deriveSigners("tapBip32Derivation", input.tapBip32Derivation?.map(([pubKey, { der }]) => ({
        pubKey,
        fingerprint: der.fingerprint,
        path: der.path
      })), (s) => s.publicKey.slice(1)) : deriveSigners("bip32Derivation", input.bip32Derivation?.map(([pubKey, der]) => ({
        pubKey,
        fingerprint: der.fingerprint,
        path: der.path
      })), (s) => s.publicKey);
      let signed = false;
      for (const s of signers) {
        if (!canSign(s.privateKey))
          continue;
        if (this.signIdx(s.privateKey, idx, allowedSighash, _auxRand))
          signed = true;
      }
      if (signed)
        return true;
      if (inputType.txType === "taproot")
        throw new Error("No taproot scripts signed");
      throw new Error(`Input script doesn't have pubKey: ${inputType.lastScript}`);
    }
    if (!allowedSighash)
      allowedSighash = [inputType.defaultSighash];
    else
      allowedSighash.forEach(validateSigHash);
    const sighash = inputType.sighash;
    if (!allowedSighash.includes(sighash)) {
      throw new Error(`Input with not allowed sigHash=${sighash}. Allowed: ${allowedSighash.join(", ")}`);
    }
    const { sigOutputs } = this.inputSighash(idx);
    if (sigOutputs === SignatureHash.SINGLE && idx >= this.outputs.length) {
      throw new Error(`Input with sighash SINGLE, but there is no output with corresponding index=${idx}`);
    }
    const prevOut = getPrevOut(input);
    if (inputType.txType === "taproot") {
      const prevOuts = this.inputs.map(getPrevOut);
      const prevOutScript = prevOuts.map((i) => i.script);
      const amount = prevOuts.map((i) => i.amount);
      let signed = false;
      let schnorrPub = pubSchnorr(privateKey);
      let merkleRoot = input.tapMerkleRoot || EMPTY;
      if (input.tapInternalKey) {
        const { pubKey, privKey } = getTaprootKeys(privateKey, schnorrPub, input.tapInternalKey, merkleRoot);
        const [taprootPubKey, _] = taprootTweakPubkey(input.tapInternalKey, merkleRoot);
        if (equalBytes2(taprootPubKey, pubKey)) {
          const hash = this.preimageWitnessV1(idx, prevOutScript, sighash, amount);
          const sig = concatBytes4(signSchnorr(hash, privKey, _auxRand), sighash !== SignatureHash.DEFAULT ? new Uint8Array([sighash]) : EMPTY);
          this.updateInput(idx, { tapKeySig: sig }, true);
          signed = true;
        }
      }
      if (input.tapLeafScript) {
        input.tapScriptSig = input.tapScriptSig || [];
        for (const [_, _script] of input.tapLeafScript) {
          const script = _script.subarray(0, -1);
          const scriptDecoded = Script.decode(script);
          const ver = _script[_script.length - 1];
          const hash = tapLeafHash(script, ver);
          const pos = scriptDecoded.findIndex((i) => isBytes5(i) && equalBytes2(i, schnorrPub));
          if (pos === -1)
            continue;
          const msg = this.preimageWitnessV1(idx, prevOutScript, sighash, amount, undefined, script, ver);
          const sig = concatBytes4(signSchnorr(msg, privateKey, _auxRand), sighash !== SignatureHash.DEFAULT ? new Uint8Array([sighash]) : EMPTY);
          this.updateInput(idx, { tapScriptSig: [[{ pubKey: schnorrPub, leafHash: hash }, sig]] }, true);
          signed = true;
        }
      }
      if (!signed)
        throw new Error("No taproot scripts signed");
      return true;
    } else {
      const pubKey = pubECDSA(privateKey);
      let hasPubkey = false;
      const pubKeyHash = hash1602(pubKey);
      for (const i of Script.decode(inputType.lastScript)) {
        if (isBytes5(i) && (equalBytes2(i, pubKey) || equalBytes2(i, pubKeyHash)))
          hasPubkey = true;
      }
      if (!hasPubkey)
        throw new Error(`Input script doesn't have pubKey: ${inputType.lastScript}`);
      let hash;
      if (inputType.txType === "legacy") {
        hash = this.preimageLegacy(idx, inputType.lastScript, sighash);
      } else if (inputType.txType === "segwit") {
        let script = inputType.lastScript;
        if (inputType.last.type === "wpkh")
          script = OutScript.encode({ type: "pkh", hash: inputType.last.hash });
        hash = this.preimageWitnessV0(idx, script, sighash, prevOut.amount);
      } else
        throw new Error(`Transaction/sign: unknown tx type: ${inputType.txType}`);
      const sig = signECDSA(hash, privateKey, this.opts.lowR);
      this.updateInput(idx, {
        partialSig: [[pubKey, concatBytes4(sig, new Uint8Array([sighash]))]]
      }, true);
    }
    return true;
  }
  sign(privateKey, allowedSighash, _auxRand) {
    this.validatePrevoutsForSigning();
    let num = 0;
    for (let i = 0;i < this.inputs.length; i++) {
      try {
        if (this.signIdx(privateKey, i, allowedSighash, _auxRand))
          num++;
      } catch (e) {}
    }
    if (!num)
      throw new Error("No inputs signed");
    return num;
  }
  finalizeIdx(idx) {
    this.checkInputIdx(idx);
    if (this.fee < _0n11)
      throw new Error("Outputs spends more than inputs amount");
    const input = this.inputs[idx];
    cleanExtensions(input, this.opts.unknown, this.opts.proprietary);
    cleanTxModifiable(this.global.txModifiable, this.opts.unknown);
    const inputType = getInputType(input, this.opts.allowLegacyWitnessUtxo);
    if (inputType.txType === "taproot") {
      if (input.tapKeySig)
        input.finalScriptWitness = [input.tapKeySig];
      else if (input.tapLeafScript && input.tapScriptSig) {
        const leafs = input.tapLeafScript.slice().sort((a, b) => TaprootControlBlock.encode(a[0]).length - TaprootControlBlock.encode(b[0]).length);
        let smallest;
        let smallestSize = Number.POSITIVE_INFINITY;
        let unsupported = false;
        for (const [cb, _script] of leafs) {
          const script = _script.slice(0, -1);
          const ver = _script[_script.length - 1];
          const outScript = OutScript.decode(script);
          const hash = tapLeafHash(script, ver);
          const scriptSig = input.tapScriptSig.filter((i) => equalBytes2(i[0].leafHash, hash));
          let signatures = [];
          let witness;
          if (outScript.type === "tr_ms") {
            const m = outScript.m;
            const pubkeys = outScript.pubkeys;
            let added = 0;
            for (const pub of pubkeys) {
              const sigIdx = scriptSig.findIndex((i) => equalBytes2(i[0].pubKey, pub));
              if (added === m || sigIdx === -1) {
                signatures.push(EMPTY);
                continue;
              }
              signatures.push(scriptSig[sigIdx][1]);
              added++;
            }
            if (added !== m)
              continue;
          } else if (outScript.type === "tr_ns") {
            for (const pub of outScript.pubkeys) {
              const sigIdx = scriptSig.findIndex((i) => equalBytes2(i[0].pubKey, pub));
              if (sigIdx === -1)
                continue;
              signatures.push(scriptSig[sigIdx][1]);
            }
            if (signatures.length !== outScript.pubkeys.length)
              continue;
          } else if (outScript.type === "unknown" && this.opts.allowUnknownInputs) {
            const scriptDecoded = Script.decode(script);
            signatures = scriptSig.map(([{ pubKey }, signature]) => {
              const pos = scriptDecoded.findIndex((i) => isBytes5(i) && equalBytes2(i, pubKey));
              if (pos === -1)
                throw new Error("finalize/taproot: cannot find position of pubkey in script");
              return { signature, pos };
            }).sort((a, b) => a.pos - b.pos).map((i) => i.signature);
            if (!signatures.length)
              continue;
          } else {
            const custom = this.opts.customScripts;
            let recognized = false;
            if (custom) {
              for (const c of custom) {
                if (!c.finalizeTaproot)
                  continue;
                const scriptDecoded = Script.decode(script);
                const csEncoded = c.encode(scriptDecoded);
                if (csEncoded === undefined)
                  continue;
                recognized = true;
                const finalized = c.finalizeTaproot(script, csEncoded, scriptSig);
                if (!finalized)
                  continue;
                witness = finalized.concat(TaprootControlBlock.encode(cb));
                break;
              }
            }
            if (!witness && !recognized && scriptSig.length)
              unsupported = true;
            if (!witness)
              continue;
          }
          witness ||= signatures.reverse().concat([script, TaprootControlBlock.encode(cb)]);
          const size = RawWitness.encode(witness).length;
          if (size >= smallestSize)
            continue;
          smallest = witness;
          smallestSize = size;
        }
        if (!smallest && unsupported)
          throw new Error("Finalize: Unknown tapLeafScript");
        if (!smallest)
          throw new Error("finalize/taproot: empty witness");
        input.finalScriptWitness = smallest;
      } else
        throw new Error("finalize/taproot: unknown input");
      delete input.finalScriptSig;
      this.cleanFinalInput(input);
      return;
    }
    if (!input.partialSig || !input.partialSig.length)
      throw new Error("Not enough partial sign");
    let inputScript = EMPTY;
    let witness = [];
    if (inputType.last.type === "ms") {
      const m = inputType.last.m;
      const pubkeys = inputType.last.pubkeys;
      let signatures = [];
      for (const pub of pubkeys) {
        const sign = input.partialSig.find((s) => equalBytes2(pub, s[0]));
        if (!sign)
          continue;
        signatures.push(sign[1]);
      }
      signatures = signatures.slice(0, m);
      if (signatures.length !== m) {
        throw new Error(`Multisig: wrong signatures count, m=${m} n=${pubkeys.length} signatures=${signatures.length}`);
      }
      inputScript = Script.encode([0, ...signatures]);
    } else if (inputType.last.type === "pk") {
      inputScript = Script.encode([input.partialSig[0][1]]);
    } else if (inputType.last.type === "pkh") {
      inputScript = Script.encode([input.partialSig[0][1], input.partialSig[0][0]]);
    } else if (inputType.last.type === "wpkh") {
      inputScript = EMPTY;
      witness = [input.partialSig[0][1], input.partialSig[0][0]];
    } else if (inputType.last.type === "unknown" && !this.opts.allowUnknownInputs)
      throw new Error("Unknown inputs not allowed");
    let finalScriptSig, finalScriptWitness;
    if (inputType.type.includes("wsh-")) {
      if (inputScript.length && inputType.lastScript.length) {
        witness = Script.decode(inputScript).map((i) => {
          if (i === 0)
            return EMPTY;
          if (isBytes5(i))
            return i;
          throw new Error(`Wrong witness op=${i}`);
        });
      }
      witness = witness.concat(inputType.lastScript);
    }
    if (inputType.txType === "segwit")
      finalScriptWitness = witness;
    if (inputType.type.startsWith("sh-wsh-")) {
      finalScriptSig = Script.encode([Script.encode([0, sha2562(inputType.lastScript)])]);
    } else if (inputType.type.startsWith("sh-")) {
      finalScriptSig = Script.encode([...Script.decode(inputScript), inputType.lastScript]);
    } else if (inputType.type.startsWith("wsh-")) {} else if (inputType.txType !== "segwit")
      finalScriptSig = inputScript;
    if (!finalScriptSig && !finalScriptWitness)
      throw new Error("Unknown error finalizing input");
    if (finalScriptSig)
      input.finalScriptSig = finalScriptSig;
    if (finalScriptWitness)
      input.finalScriptWitness = finalScriptWitness;
    this.cleanFinalInput(input);
  }
  finalize() {
    for (let i = 0;i < this.inputs.length; i++)
      this.finalizeIdx(i);
  }
  extract() {
    if (!this.isFinal)
      throw new Error("Transaction has unfinalized inputs");
    if (!this.outputs.length)
      throw new Error("Transaction has no outputs");
    if (this.fee < _0n11)
      throw new Error("Outputs spends more than inputs amount");
    return this.toBytes(true, true);
  }
  combine(other) {
    if (!(other instanceof Transaction))
      throw new TypeError('"other" expected Transaction, got type=' + typeof other);
    const opts = this.opts;
    const PSBTVersion = Math.max(this.opts.PSBTVersion || 0, other.opts.PSBTVersion || 0);
    if (this.opts.version !== other.opts.version)
      throw new Error(`Transaction/combine: different version this=${this.opts.version} ` + `other=${other.opts.version}`);
    const thisV2 = this.isPSBTv2();
    const otherV2 = other.isPSBTv2();
    if (!thisV2 || !otherV2) {
      const thisLockTime = this.lockTime;
      const otherLockTime = other.lockTime;
      if (thisLockTime !== otherLockTime)
        throw new Error(`Transaction/combine: different lockTime this=${thisLockTime} other=${otherLockTime}`);
    }
    for (const k of ["inputs", "outputs"]) {
      if (this[k].length !== other[k].length) {
        throw new Error(`Transaction/combine: different ${k} length this=${this[k].length} other=${other[k].length}`);
      }
    }
    const unsignedTx = this.unsignedTx;
    if (!equalBytes2(unsignedTx, other.unsignedTx))
      throw new Error(`Transaction/combine: different unsigned tx`);
    let txModifiable;
    if (thisV2 && otherV2) {
      const policy = (tx) => {
        if (tx.global.txModifiable !== undefined)
          return cleanTxModifiable(tx.global.txModifiable, opts.unknown);
        return opts.allowMissingTxModifiable ? tx.modifiable(true, opts.unknown) : 0;
      };
      const a = policy(this);
      const b = policy(other);
      if ((a & ~7) !== (b & ~7))
        throw new Error("Transaction/combine: conflicting unknown txModifiable flags");
      txModifiable = a & ~7 | a & b & 3 | (a | b) & 4;
      if (txModifiable === 0 && this.global.txModifiable === undefined && other.global.txModifiable === undefined && !opts.allowMissingTxModifiable)
        txModifiable = undefined;
    } else if (thisV2)
      txModifiable = this.modifiable(opts.allowMissingTxModifiable, opts.unknown);
    else if (otherV2)
      txModifiable = other.modifiable(opts.allowMissingTxModifiable, opts.unknown);
    const thisGlobal = { ...this.global };
    const otherGlobal = { ...other.global };
    if (thisV2 !== otherV2) {
      if (!thisV2)
        delete thisGlobal.fallbackLocktime;
      if (!otherV2)
        delete otherGlobal.fallbackLocktime;
      if (!thisV2)
        delete thisGlobal.version;
      if (!otherV2)
        delete otherGlobal.version;
    }
    const fallbackLocktime = thisGlobal.fallbackLocktime !== undefined ? thisGlobal.fallbackLocktime : otherGlobal.fallbackLocktime;
    delete thisGlobal.txModifiable;
    delete otherGlobal.txModifiable;
    delete thisGlobal.fallbackLocktime;
    delete otherGlobal.fallbackLocktime;
    const global = combineKeyMap(PSBTGlobal, thisGlobal, otherGlobal, opts.unknown, opts.proprietary);
    if (fallbackLocktime !== undefined)
      global.fallbackLocktime = fallbackLocktime;
    if (PSBTVersion)
      global.version = PSBTVersion;
    if (txModifiable === undefined)
      delete global.txModifiable;
    else
      global.txModifiable = txModifiable;
    let hasOpaqueFinalizedV0 = false;
    const inputs = this.inputs.map((current, i) => {
      const currentFinal = this.inputStatus(i) === "finalized";
      const otherFinal = other.inputStatus(i) === "finalized";
      if (!thisV2 && currentFinal || !otherV2 && otherFinal)
        hasOpaqueFinalizedV0 = true;
      if (currentFinal && otherFinal) {
        for (const k of ["finalScriptSig", "finalScriptWitness"]) {
          const currentHas = !!this.inputs[i][k]?.length;
          const otherHas = !!other.inputs[i][k]?.length;
          if (currentHas !== otherHas)
            throw new Error(`Transaction/combine: different finalized field=${k} input=${i}`);
        }
      }
      const combined = combineKeyMap(PSBTInput, current, other.inputs[i], opts.unknown, opts.proprietary);
      if (currentFinal || otherFinal)
        cleanFinalInput(combined, opts.unknown, opts.proprietary);
      return cloneDeep(normalizeInput(combined, undefined, undefined, opts.disableScriptCheck, opts.unknown, opts.proprietary));
    });
    if (hasOpaqueFinalizedV0 && global.txModifiable !== undefined)
      global.txModifiable &= ~3;
    const candidate = new Transaction({ ...opts, PSBTVersion });
    const outputs = this.outputs.map((current, i) => {
      const combined = combineKeyMap(PSBTOutput, current, other.outputs[i], opts.unknown, opts.proprietary);
      return cloneDeep(candidate.normalizeOutput(combined));
    });
    candidate.global = global;
    candidate.inputs = inputs;
    candidate.outputs = outputs;
    if ((!thisV2 || !otherV2) && candidate.isPSBTv2())
      candidate.global.txModifiable = candidate.txModifiable;
    if (!equalBytes2(candidate.unsignedTx, unsignedTx))
      throw new Error("Transaction/combine: combined unsigned tx differs");
    this.global = candidate.global;
    this.inputs = candidate.inputs;
    this.outputs = candidate.outputs;
    return this;
  }
  clone() {
    return Transaction.fromPSBT(this.toPSBT(), this.opts);
  }
}
// node_modules/@scure/btc-signer/index.js
var utils2 = /* @__PURE__ */ (() => Object.freeze({
  isBytes: isBytes5,
  concatBytes: concatBytes4,
  compareBytes,
  pubSchnorr,
  randomPrivateKeyBytes,
  taprootTweakPubkey
}))();

// src/lib/bitcoin/errors.ts
class WalletError extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = "WalletError";
  }
}

// src/lib/bitcoin/descriptor.ts
class DescriptorError extends WalletError {
  constructor(message) {
    super(message);
    this.name = "DescriptorError";
  }
}
var SCRIPT_TYPE_LABELS = {
  pkh: "Legacy (P2PKH)",
  "sh-wpkh": "Nested SegWit (P2SH-P2WPKH)",
  wpkh: "Native SegWit (P2WPKH)",
  tr: "Taproot (P2TR)",
  "wsh-multi": "Multisig (P2WSH)"
};
function describeWallet(d) {
  if (d.type === "wsh-multi")
    return `${d.threshold}-of-${d.keys.length} multisig (P2WSH)`;
  return SCRIPT_TYPE_LABELS[d.type];
}
var b58 = base58check(sha256);
var VERSIONS = {
  76067358: { network: "mainnet", private: false },
  77429938: { network: "mainnet", implies: "sh-wpkh", private: false },
  78792518: { network: "mainnet", implies: "wpkh", private: false },
  70617039: { network: "testnet", private: false },
  71979618: { network: "testnet", implies: "sh-wpkh", private: false },
  73342198: { network: "testnet", implies: "wpkh", private: false },
  76066276: { network: "mainnet", private: true },
  77428856: { network: "mainnet", private: true },
  78791436: { network: "mainnet", private: true },
  70615956: { network: "testnet", private: true },
  71978536: { network: "testnet", private: true },
  73341116: { network: "testnet", private: true }
};
var XPUB = { mainnet: 76067358, testnet: 70617039 };
var BIP32_VERSIONS = {
  mainnet: { private: 76066276, public: 76067358 },
  testnet: { private: 70615956, public: 70617039 }
};
var PRIVATE_KEY_MESSAGE = "That is a private key. Bookie only needs the public key (xpub, ypub or zpub), and you should never paste a private key anywhere.";
function normaliseExtendedKey(text) {
  let raw;
  try {
    raw = b58.decode(text);
  } catch {
    throw new DescriptorError("That extended key is not valid (its checksum does not match).");
  }
  if (raw.length !== 78)
    throw new DescriptorError("That extended key is the wrong length.");
  const versionNumber = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0);
  const version = VERSIONS[versionNumber];
  if (!version)
    throw new DescriptorError("Bookie does not recognise that extended key prefix.");
  if (version.private)
    throw new DescriptorError(PRIVATE_KEY_MESSAGE);
  const out = new Uint8Array(raw);
  new DataView(out.buffer).setUint32(0, XPUB[version.network]);
  const xpub = b58.encode(out);
  try {
    HDKey.fromExtendedKey(xpub, BIP32_VERSIONS[version.network]);
  } catch {
    throw new DescriptorError("That extended key is not a valid public key.");
  }
  return { xpub, version };
}
var INPUT_CHARSET = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
var CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
var GENERATOR = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];
function polymod(symbols) {
  let chk = 1n;
  for (const value of symbols) {
    const top = chk >> 35n;
    chk = (chk & 0x7ffffffffn) << 5n ^ BigInt(value);
    for (let i = 0;i < 5; i++)
      if (top >> BigInt(i) & 1n)
        chk ^= GENERATOR[i];
  }
  return chk;
}
function expand(s) {
  const symbols = [];
  let groups = [];
  for (const c of s) {
    const v = INPUT_CHARSET.indexOf(c);
    if (v === -1)
      return;
    symbols.push(v & 31);
    groups.push(v >> 5);
    if (groups.length === 3) {
      symbols.push(groups[0] * 9 + groups[1] * 3 + groups[2]);
      groups = [];
    }
  }
  if (groups.length === 1)
    symbols.push(groups[0]);
  else if (groups.length === 2)
    symbols.push(groups[0] * 3 + groups[1]);
  return symbols;
}
function descriptorChecksum(descriptor) {
  const symbols = expand(descriptor);
  if (!symbols)
    throw new DescriptorError("The descriptor contains characters that are not allowed.");
  const checksum = polymod([...symbols, 0, 0, 0, 0, 0, 0, 0, 0]) ^ 1n;
  let out = "";
  for (let i = 0;i < 8; i++)
    out += CHECKSUM_CHARSET[Number(checksum >> BigInt(5 * (7 - i)) & 31n)];
  return out;
}
function verifyDescriptorChecksum(withChecksum) {
  const at = withChecksum.lastIndexOf("#");
  if (at === -1 || withChecksum.length - at !== 9)
    return false;
  const body = withChecksum.slice(0, at);
  const sum = withChecksum.slice(at + 1);
  if (![...sum].every((c) => CHECKSUM_CHARSET.includes(c)))
    return false;
  const symbols = expand(body);
  if (!symbols)
    return false;
  return polymod([...symbols, ...[...sum].map((c) => CHECKSUM_CHARSET.indexOf(c))]) === 1n;
}
var MAX_INDEX = 2147483647;
function parseIndex(text) {
  if (/^\d+['hH]$/.test(text)) {
    throw new DescriptorError("Hardened steps after an xpub cannot be derived from a public key. Give the account xpub with a non-hardened path such as /<0;1>/*.");
  }
  if (!/^\d+$/.test(text))
    throw new DescriptorError(`"${text}" is not a valid derivation step.`);
  const value = Number(text);
  if (value > MAX_INDEX)
    throw new DescriptorError(`Derivation step ${text} is out of range.`);
  return value;
}
function parseKey(text) {
  let rest = text.trim();
  let origin;
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    if (end === -1)
      throw new DescriptorError('A key origin is missing its closing "]".');
    origin = rest.slice(1, end);
    if (!/^[0-9a-fA-F]{8}(\/\d+['hH]?)*$/.test(origin)) {
      throw new DescriptorError("The key origin must be a fingerprint and path, like [d34db33f/84h/0h/0h].");
    }
    rest = rest.slice(end + 1);
  }
  const [keyText, ...path] = rest.split("/");
  if (/^(0[23][0-9a-fA-F]{64}|[0-9a-fA-F]{64})$/.test(keyText)) {
    throw new DescriptorError("Bookie needs extended public keys (xpub) so it can find every address; a single public key is not enough.");
  }
  const { xpub, version } = normaliseExtendedKey(keyText);
  if (version.implies) {
    throw new DescriptorError("Inside a descriptor, give keys as xpub (or tpub), not ypub or zpub.");
  }
  if (path.at(-1) !== "*") {
    throw new DescriptorError("Each key needs a ranged path ending in /*, such as /<0;1>/*.");
  }
  if (path.some((p, i) => i < path.length - 1 && p === "*")) {
    throw new DescriptorError("Only the last derivation step may be *.");
  }
  const steps = path.slice(0, -1).map((step) => {
    const multi = /^<([^;>]+);([^;>]+)>$/.exec(step);
    if (multi)
      return [parseIndex(multi[1]), parseIndex(multi[2])];
    if (step.startsWith("<")) {
      throw new DescriptorError("Use <receive;change> with exactly two steps, such as <0;1>.");
    }
    return parseIndex(step);
  });
  if (steps.filter(Array.isArray).length > 1) {
    throw new DescriptorError("A key may have only one <receive;change> step.");
  }
  return { xpub, origin, steps, network: version.network };
}
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0;i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{" || c === "<")
      depth++;
    else if (c === ")" || c === "]" || c === "}" || c === ">")
      depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
function unwrap(text, name) {
  if (!text.startsWith(`${name}(`) || !text.endsWith(")"))
    return;
  return text.slice(name.length + 1, -1);
}
function keyText(k) {
  const path = k.steps.map((s) => Array.isArray(s) ? `<${s[0]};${s[1]}>` : String(s));
  return `${k.origin ? `[${k.origin}]` : ""}${k.xpub}/${[...path, "*"].join("/")}`;
}
function canonicalBody(d) {
  const keys = d.keys.map(keyText);
  switch (d.type) {
    case "pkh":
      return `pkh(${keys[0]})`;
    case "wpkh":
      return `wpkh(${keys[0]})`;
    case "sh-wpkh":
      return `sh(wpkh(${keys[0]}))`;
    case "tr":
      return `tr(${keys[0]})`;
    case "wsh-multi":
      return `wsh(${d.sorted ? "sortedmulti" : "multi"}(${d.threshold},${keys.join(",")}))`;
  }
}
function build(type, keys, extra = {}) {
  const network = keys[0].network;
  if (keys.some((k) => k.network !== network)) {
    throw new DescriptorError("All keys must be on the same network (mainnet or testnet).");
  }
  const multipath = keys.map((k) => k.steps.some(Array.isArray));
  if (multipath.some((m) => m !== multipath[0])) {
    throw new DescriptorError("Either every key or no key may have a <receive;change> step.");
  }
  const plain = keys.map(({ xpub, origin, steps }) => ({ xpub, origin, steps }));
  const base = { type, network, keys: plain, ...extra };
  const body = canonicalBody(base);
  return {
    ...base,
    hasChange: multipath[0],
    canonical: `${body}#${descriptorChecksum(body)}`
  };
}
function parseDescriptor(text) {
  let body = text;
  const hash = text.indexOf("#");
  if (hash !== -1) {
    if (!verifyDescriptorChecksum(text)) {
      throw new DescriptorError("The descriptor checksum (after #) does not match. Copy it again from your wallet.");
    }
    body = text.slice(0, hash);
  }
  const wpkh = unwrap(body, "wpkh");
  if (wpkh !== undefined)
    return build("wpkh", [parseKey(wpkh)]);
  const pkh = unwrap(body, "pkh");
  if (pkh !== undefined)
    return build("pkh", [parseKey(pkh)]);
  const sh = unwrap(body, "sh");
  if (sh !== undefined) {
    const inner = unwrap(sh, "wpkh");
    if (inner === undefined)
      throw new DescriptorError("Bookie supports sh(wpkh(...)) only.");
    return build("sh-wpkh", [parseKey(inner)]);
  }
  const tr = unwrap(body, "tr");
  if (tr !== undefined) {
    if (splitArgs(tr).length > 1) {
      throw new DescriptorError("Taproot with script paths is not supported yet: use a single-key tr(...).");
    }
    return build("tr", [parseKey(tr)]);
  }
  const wsh = unwrap(body, "wsh");
  if (wsh !== undefined) {
    const sortedInner = unwrap(wsh, "sortedmulti");
    const inner = sortedInner ?? unwrap(wsh, "multi");
    if (inner === undefined) {
      throw new DescriptorError("Bookie supports wsh(multi(...)) and wsh(sortedmulti(...)) only.");
    }
    const [k, ...keyArgs] = splitArgs(inner);
    if (!/^\d+$/.test(k.trim()))
      throw new DescriptorError("The multisig threshold must be a number.");
    const threshold = Number(k);
    if (keyArgs.length < 1 || keyArgs.length > 20) {
      throw new DescriptorError("A multisig needs between 1 and 20 keys.");
    }
    if (threshold < 1 || threshold > keyArgs.length) {
      throw new DescriptorError(`The threshold must be between 1 and ${keyArgs.length}.`);
    }
    return build("wsh-multi", keyArgs.map(parseKey), {
      threshold,
      sorted: sortedInner !== undefined
    });
  }
  throw new DescriptorError("Bookie supports xpub/ypub/zpub keys and the descriptors pkh, wpkh, sh(wpkh), tr and wsh(multi or sortedmulti).");
}
function parseWalletInput(input, scriptType) {
  const text = input.replace(/\s+/g, "");
  if (!text)
    throw new DescriptorError("Paste an xpub, ypub, zpub or an output descriptor.");
  if (/(^|[(,\]])[xyztuv]prv/.test(text)) {
    throw new DescriptorError(PRIVATE_KEY_MESSAGE);
  }
  if (text.includes("(")) {
    const parsed = parseDescriptor(text);
    if (scriptType && scriptType !== parsed.type) {
      throw new DescriptorError("The descriptor already says which script type it uses; leave the script type blank.");
    }
    return parsed;
  }
  const { xpub, version } = normaliseExtendedKey(text);
  const type = version.implies ?? scriptType;
  if (!type) {
    throw new DescriptorError("An xpub does not say which kind of addresses it makes. Choose the script type your wallet uses.");
  }
  if (version.implies && scriptType && scriptType !== version.implies) {
    throw new DescriptorError(`That key's prefix means ${SCRIPT_TYPE_LABELS[version.implies]}; it cannot be used as ${SCRIPT_TYPE_LABELS[scriptType]}.`);
  }
  if (type === "wsh-multi") {
    throw new DescriptorError("A multisig needs a descriptor with all its keys: wsh(sortedmulti(...)).");
  }
  return build(type, [{ xpub, steps: [[0, 1]], network: version.network }]);
}
function btcNetwork(network) {
  return network === "mainnet" ? NETWORK : TEST_NETWORK;
}
function scriptDeriver(d) {
  const versions = BIP32_VERSIONS[d.network];
  const network = btcNetwork(d.network);
  const parents = new Map;
  const parentKeys = (chain) => {
    const hit = parents.get(chain);
    if (hit)
      return hit;
    if (chain === "change" && !d.hasChange) {
      throw new DescriptorError("This descriptor has no change chain.");
    }
    const keys = d.keys.map((k) => {
      let node = HDKey.fromExtendedKey(k.xpub, versions);
      for (const step of k.steps) {
        node = node.deriveChild(Array.isArray(step) ? step[chain === "receive" ? 0 : 1] : step);
      }
      return node;
    });
    parents.set(chain, keys);
    return keys;
  };
  return (chain, index) => {
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
      throw new DescriptorError("Address index out of range.");
    }
    const pubkeys = parentKeys(chain).map((k) => {
      const pk = k.deriveChild(index).publicKey;
      if (!pk)
        throw new DescriptorError("Could not derive a public key.");
      return pk;
    });
    let payment;
    switch (d.type) {
      case "pkh":
        payment = p2pkh(pubkeys[0], network);
        break;
      case "wpkh":
        payment = p2wpkh(pubkeys[0], network);
        break;
      case "sh-wpkh":
        payment = p2sh(p2wpkh(pubkeys[0], network), network);
        break;
      case "tr":
        payment = p2tr(pubkeys[0].slice(1), undefined, network);
        break;
      case "wsh-multi": {
        const keys = d.sorted ? [...pubkeys].sort(utils2.compareBytes) : pubkeys;
        payment = p2wsh(p2ms(d.threshold ?? 1, keys), network);
        break;
      }
    }
    if (!payment.address)
      throw new DescriptorError("Could not make an address for this script.");
    return { chain, index, script: hex.encode(payment.script), address: payment.address };
  };
}
function electrumScriptHash(scriptHex) {
  return hex.encode(sha256(hex.decode(scriptHex)).reverse());
}

// src/lib/bitcoin/electrum.ts
import { createHash } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

class ElectrumError extends Error {
  detail;
  constructor(message, detail) {
    super(message);
    this.detail = detail;
    this.name = "ElectrumError";
  }
}
function connectionMessage(error) {
  const code = error.code ?? "";
  if (code === "ECONNREFUSED")
    return "The Electrum server refused the connection.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "The Electrum server’s name could not be found.";
  if (code === "ETIMEDOUT")
    return "Timed out connecting to the Electrum server.";
  if (code === "BOOKIE_CERT_PIN") {
    return "The Electrum server’s TLS certificate does not match BOOKIE_ELECTRUM_CERT_SHA256.";
  }
  if (/^(CERT_|ERR_TLS_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/.test(code)) {
    return "The Electrum server’s TLS certificate could not be verified.";
  }
  return "Could not connect to the Electrum server.";
}
function parseElectrumUrl(url) {
  const match = /^(ssl|tcp):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):(\d{1,5})\/?$/.exec(url.trim());
  if (!match) {
    throw new ElectrumError("BOOKIE_ELECTRUM_URL must look like ssl://host:port or tcp://host:port.");
  }
  const port = Number(match[3]);
  if (port < 1 || port > 65535)
    throw new ElectrumError("The Electrum port is out of range.");
  return {
    protocol: match[1],
    host: match[2].replace(/^\[|\]$/g, ""),
    port
  };
}

class ElectrumClient {
  socket;
  options;
  nextId = 1;
  buffer = "";
  pending = new Map;
  queue = [];
  inFlight = 0;
  closed;
  constructor(socket, options) {
    this.socket = socket;
    this.options = options;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (error) => this.fail(new ElectrumError("The connection to the Electrum server failed.", error.message)));
    socket.on("close", () => this.fail(new ElectrumError("The Electrum server closed the connection.")));
  }
  static async connect(server, options = {}) {
    const settings = {
      timeoutMs: options.timeoutMs ?? 20000,
      connectTimeoutMs: options.connectTimeoutMs ?? 1e4,
      maxInFlight: options.maxInFlight ?? 40
    };
    const pin = options.certSha256?.replace(/:/g, "").toLowerCase();
    const socket = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        s.destroy();
        reject(new ElectrumError("Timed out connecting to the Electrum server."));
      }, settings.connectTimeoutMs);
      const done = (error) => {
        clearTimeout(timer);
        if (error) {
          s.destroy();
          reject(new ElectrumError(connectionMessage(error), error.message));
        } else
          resolve(s);
      };
      const s = server.protocol === "ssl" ? tls.connect({
        host: server.host,
        port: server.port,
        servername: net.isIP(server.host) ? undefined : server.host,
        rejectUnauthorized: !pin
      }) : net.connect({ host: server.host, port: server.port });
      s.once(server.protocol === "ssl" ? "secureConnect" : "connect", () => {
        if (pin && s instanceof tls.TLSSocket) {
          const cert = s.getPeerCertificate();
          const fingerprint = cert?.raw ? createHash("sha256").update(cert.raw).digest("hex") : "";
          if (fingerprint !== pin) {
            done(Object.assign(new Error("TLS certificate fingerprint mismatch"), {
              code: "BOOKIE_CERT_PIN"
            }));
            return;
          }
        }
        done();
      });
      s.once("error", (error) => done(error));
    });
    const client = new ElectrumClient(socket, settings);
    try {
      await client.request("server.version", ["Bookie", "1.4"]);
    } catch (error) {
      client.close();
      throw error;
    }
    return client;
  }
  onData(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 64 * 1024 * 1024) {
      this.fail(new ElectrumError("The Electrum server sent an oversized response."));
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf(`
`)) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line)
        this.onMessage(line);
    }
  }
  onMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== "number")
      return;
    const entry = this.pending.get(message.id);
    if (!entry)
      return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    this.release();
    if (message.error) {
      const text = typeof message.error === "string" ? message.error : message.error.message;
      entry.reject(new ElectrumError("The Electrum server returned an error.", text ?? "unknown error"));
    } else
      entry.resolve(message.result);
  }
  release() {
    this.inFlight--;
    this.queue.shift()?.();
  }
  fail(error) {
    if (this.closed)
      return;
    this.closed = error;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.queue.length = 0;
    this.socket.destroy();
  }
  request(method, params = []) {
    if (this.closed)
      return Promise.reject(this.closed);
    return new Promise((resolve, reject) => {
      const send = () => {
        if (this.closed) {
          reject(this.closed);
          return;
        }
        this.inFlight++;
        const id = this.nextId++;
        const timer = setTimeout(() => {
          if (!this.pending.delete(id))
            return;
          this.release();
          reject(new ElectrumError(`The Electrum server did not answer ${method} in time.`));
        }, this.options.timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}
`);
      };
      if (this.inFlight < this.options.maxInFlight)
        send();
      else
        this.queue.push(send);
    });
  }
  close() {
    this.fail(new ElectrumError("Connection closed."));
  }
}

// src/lib/bitcoin/format.ts
function satsToBtc(sats) {
  const sign = sats < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(sats));
  return `${sign}${Math.floor(abs / 1e8).toLocaleString("en-GB")}.${String(abs % 1e8).padStart(8, "0")}`;
}

// src/lib/bitcoin/kraken.ts
var KRAKEN = "https://api.kraken.com/0/public";
var DAY = 86400;
var MAX_TRADE_GAP_SECONDS = 6 * 3600;
var LOOKBACK_SECONDS = 15 * 60;
function krakenPair(currency) {
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && code !== "BTC" && code !== "XBT" ? `XBT${code}` : undefined;
}

class KrakenError extends Error {
  unknownPair;
  constructor(message, unknownPair = false) {
    super(message);
    this.unknownPair = unknownPair;
    this.name = "KrakenError";
  }
}
function pairRows(json) {
  const body = json;
  if (!body || typeof body !== "object")
    throw new KrakenError("Kraken sent an unreadable response.");
  if (body.error && body.error.length > 0) {
    const unknown = body.error.some((e) => /Unknown asset pair/i.test(e));
    throw new KrakenError(`Kraken: ${body.error.join(", ")}`, unknown);
  }
  const entry = Object.entries(body.result ?? {}).find(([key]) => key !== "last");
  if (!entry || !Array.isArray(entry[1]))
    throw new KrakenError("Kraken returned no price data.");
  return entry[1];
}
function positive(value) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function parseKrakenOhlc(json) {
  return pairRows(json).map((row) => {
    if (!Array.isArray(row))
      return;
    const time = Number(row[0]);
    const close = positive(row[4]);
    return Number.isInteger(time) && close ? { time, close } : undefined;
  }).filter((c) => !!c).sort((a, b) => a.time - b.time);
}
function parseKrakenTrades(json) {
  return pairRows(json).map((row) => {
    if (!Array.isArray(row))
      return;
    const price = positive(row[0]);
    const time = Number(row[2]);
    return price && Number.isFinite(time) ? { price, time } : undefined;
  }).filter((t) => !!t).sort((a, b) => a.time - b.time);
}
var dateLabel = (unix) => new Date(unix * 1000).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
var timeLabel = (unix) => `${new Date(unix * 1000).toLocaleTimeString("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
})} UTC, ${dateLabel(unix)}`;
function dailyCloseRate(candles, blockTime, now, currency, use = "fallback") {
  const dayStart = blockTime - blockTime % DAY;
  const candle = candles.find((c) => c.time === dayStart);
  if (!candle || candle.time + DAY > now)
    return;
  return {
    perBtc: candle.close,
    currency,
    source: "kraken-daily-close",
    rateTime: new Date((candle.time + DAY) * 1000).toISOString(),
    label: `Kraken ${krakenPair(currency)} daily close, ${dateLabel(candle.time)}${use === "fallback" ? " (fallback: the price at the block time wasn't available)" : ""}`
  };
}
var tradeRateOf = (trade, currency, label) => ({
  perBtc: trade.price,
  currency,
  source: "kraken-trade",
  rateTime: new Date(Math.floor(trade.time * 1000)).toISOString(),
  label
});
function nearestTradeRate(trades, at, currency) {
  let best;
  for (const t of trades) {
    if (!best || Math.abs(t.time - at) < Math.abs(best.time - at))
      best = t;
  }
  if (!best || Math.abs(best.time - at) > MAX_TRADE_GAP_SECONDS)
    return;
  return tradeRateOf(best, currency, `Kraken ${krakenPair(currency)} at ${timeLabel(best.time)}`);
}
function latestTradeRate(trades, currency) {
  const trade = trades.at(-1);
  if (!trade)
    return;
  return tradeRateOf(trade, currency, `Kraken ${krakenPair(currency)} last trade at ${timeLabel(trade.time)}`);
}
var roundCents = (x) => Math.sign(x) * Math.round(Math.abs(x) * 100) / 100;
function valueFor(sats, rate) {
  return {
    ok: true,
    amount: roundCents(sats / 1e8 * rate.perBtc),
    currency: rate.currency,
    rate
  };
}
function noPairReason(currency) {
  if (!currency)
    return "The organisation's base currency isn't available, so there is no value.";
  if (!krakenPair(currency))
    return `There is no Kraken price for BTC in ${currency}.`;
  return;
}
async function krakenJson(fetchImpl, path) {
  let response;
  try {
    response = await fetchImpl(`${KRAKEN}/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new KrakenError("Kraken could not be reached.");
  }
  if (!response.ok)
    throw new KrakenError(`Kraken returned ${response.status}.`);
  return response.json();
}
var unknownPairReason = (currency) => `Kraken doesn't list ${krakenPair(currency)}, so there is no BTC price in ${currency}. Bookie doesn't convert through another currency.`;
var OHLC_TTL_MS = 10 * 60000;
var LATEST_TTL_MS = 60000;
var MAX_TRADE_LOOKUPS = 12;
var ohlcCache = new Map;
var latestCache = new Map;
var tradeCache = new Map;
function cached(map, key, ttl, nowMs, load) {
  const hit = map.get(key);
  if (hit && nowMs - hit.at < ttl)
    return hit.value;
  const value = load();
  map.set(key, { at: nowMs, value });
  value.catch(() => {
    if (map.get(key)?.value === value)
      map.delete(key);
  });
  return value;
}
async function latestRate(currency, fetchImpl = fetch, nowMs = Date.now()) {
  const pair = krakenPair(currency);
  if (!pair)
    return;
  return cached(latestCache, pair, LATEST_TTL_MS, nowMs, () => krakenJson(fetchImpl, `Trades?pair=${pair}`).then((json) => latestTradeRate(parseKrakenTrades(json), currency.toUpperCase())));
}
async function valueNow(sats, currency, fetchImpl = fetch) {
  const missing = noPairReason(currency);
  if (missing)
    return { ok: false, reason: missing };
  try {
    const rate = await latestRate(currency, fetchImpl);
    return rate ? valueFor(sats, rate) : { ok: false, reason: `Kraken returned no recent ${krakenPair(currency)} trade.` };
  } catch (error) {
    if (error instanceof KrakenError && error.unknownPair) {
      return { ok: false, reason: unknownPairReason(currency.toUpperCase()) };
    }
    return { ok: false, reason: error.message || "Kraken prices are unavailable." };
  }
}
async function ratesForBlockTimes(blockTimes, currency, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  const out = new Map;
  const unique = [...new Set(blockTimes)].sort((a, b) => b - a);
  if (unique.length === 0)
    return out;
  const missing = noPairReason(currency);
  if (missing) {
    for (const time of unique)
      out.set(time, missing);
    return out;
  }
  const code = currency.trim().toUpperCase();
  const pair = krakenPair(code);
  const noTrade = `Kraken has no ${pair} trade within six hours of the block time.`;
  let candles;
  const fallback = async (time, why) => {
    candles ??= cached(ohlcCache, pair, OHLC_TTL_MS, nowMs, () => krakenJson(fetchImpl, `OHLC?pair=${pair}&interval=1440`).then(parseKrakenOhlc)).catch((error) => error instanceof KrakenError && error.unknownPair ? unknownPairReason(code) : error instanceof KrakenError ? error.message : "Kraken prices are unavailable.");
    const list = await candles;
    if (typeof list === "string")
      return list;
    return dailyCloseRate(list, time, now, code) ?? why;
  };
  let lookups = 0;
  for (const time of unique) {
    const key = `${pair}:${time}`;
    const hit = tradeCache.get(key);
    if (hit) {
      out.set(time, hit);
      continue;
    }
    if (hit === null) {
      out.set(time, await fallback(time, noTrade));
      continue;
    }
    if (lookups >= MAX_TRADE_LOOKUPS) {
      out.set(time, await fallback(time, "Not looked up yet: Kraken limits how fast Bookie may ask. Reload in a minute."));
      continue;
    }
    try {
      lookups++;
      const trades = parseKrakenTrades(await krakenJson(fetchImpl, `Trades?pair=${pair}&since=${time - LOOKBACK_SECONDS}`));
      if (!trades.some((t) => t.time >= time) && lookups < MAX_TRADE_LOOKUPS) {
        lookups++;
        trades.push(...parseKrakenTrades(await krakenJson(fetchImpl, `Trades?pair=${pair}&since=${time}`)));
      }
      const rate = nearestTradeRate(trades, time, code);
      if (rate || now - time > MAX_TRADE_GAP_SECONDS)
        tradeCache.set(key, rate ?? null);
      if (tradeCache.size > 5000)
        tradeCache.clear();
      out.set(time, rate ?? await fallback(time, noTrade));
    } catch (error) {
      if (error instanceof KrakenError && error.unknownPair) {
        for (const t of unique)
          out.set(t, unknownPairReason(code));
        return out;
      }
      out.set(time, await fallback(time, error instanceof KrakenError ? error.message : "Kraken prices are unavailable."));
    }
  }
  return out;
}

// src/lib/bitcoin/reconcile.ts
var DEFAULT_WINDOW_DAYS = 3;
var MIN_TXID_PREFIX = 20;
function txDate(tx) {
  return tx.blockTime ? new Date(tx.blockTime * 1000).toISOString().slice(0, 10) : undefined;
}
function entryTxid(entry, txids) {
  const ref = entry.externalDocumentNumber?.trim().toLowerCase() ?? "";
  if (ref.length >= MIN_TXID_PREFIX && /^[0-9a-f]+$/.test(ref)) {
    const hit = txids.find((id) => id.startsWith(ref));
    if (hit)
      return hit;
  }
  const text = entry.description?.toLowerCase() ?? "";
  if (text.length >= 64)
    return txids.find((id) => text.includes(id));
  return;
}
var dayDiff = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
function reconcile(transactions, entries, options = {}) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const txs = transactions.map((t) => ({ ...t, date: txDate(t) }));
  const txids = txs.map((t) => t.txid);
  const used = new Set;
  const byTxid = new Map;
  for (const entry of entries) {
    const txid = entryTxid(entry, txids);
    if (!txid)
      continue;
    byTxid.set(txid, [...byTxid.get(txid) ?? [], entry]);
    used.add(entry.id);
  }
  const matched = [];
  const chainOnly = [];
  const pending = [];
  const ordered = [...txs].sort((a, b) => (a.blockTime ?? Infinity) - (b.blockTime ?? Infinity));
  for (const tx of ordered) {
    const linked = byTxid.get(tx.txid);
    if (linked) {
      const ledgerSats = linked.reduce((s, e) => s + e.amountSats, 0);
      matched.push({
        tx,
        entries: linked,
        by: "txid",
        amountDiffers: ledgerSats !== tx.netSats,
        ledgerSats
      });
      continue;
    }
    if (tx.pending || !tx.date) {
      pending.push(tx);
      continue;
    }
    const candidates = entries.filter((e) => !used.has(e.id) && e.amountSats === tx.netSats && dayDiff(e.postingDate, tx.date) <= windowDays).sort((a, b) => dayDiff(a.postingDate, tx.date) - dayDiff(b.postingDate, tx.date) || (a.entryNumber ?? 0) - (b.entryNumber ?? 0) || a.id.localeCompare(b.id));
    const entry = candidates[0];
    if (entry) {
      used.add(entry.id);
      matched.push({
        tx,
        entries: [entry],
        by: "amount",
        amountDiffers: false,
        ledgerSats: entry.amountSats
      });
    } else {
      chainOnly.push(tx);
    }
  }
  const newestFirst = (a, b) => (b.blockTime ?? Infinity) - (a.blockTime ?? Infinity);
  return {
    matched: matched.sort((a, b) => newestFirst(a.tx, b.tx)),
    chainOnly: chainOnly.sort(newestFirst),
    pending,
    ledgerOnly: entries.filter((e) => !used.has(e.id)).sort((a, b) => b.postingDate.localeCompare(a.postingDate))
  };
}
var btc = (sats) => Number(satsToBtc(sats).replace(/,/g, ""));
function summariseReconcile(input) {
  const { result, scan } = input;
  const draftsKnown = input.drafted !== "not available";
  const drafted = new Set(draftsKnown ? input.drafted ?? [] : []);
  const differs = result.matched.filter((m) => m.amountDiffers);
  return {
    wallet: input.wallet,
    bankAccount: input.bankAccountNumber,
    status: "ok",
    readAtBlock: scan.tip.height,
    counts: {
      matched: result.matched.length,
      matchedButAmountsDiffer: differs.length,
      onChainNotInBooks: result.chainOnly.length,
      inBooksNotOnChain: result.ledgerOnly.length,
      pending: result.pending.length,
      draftedNotPosted: draftsKnown ? drafted.size : "not available"
    },
    balances: {
      onChainConfirmedBtc: btc(scan.balance.confirmedSats),
      inBooksBtc: btc(input.ledgerSats),
      differenceBtc: btc(scan.balance.confirmedSats - input.ledgerSats),
      note: "In the books = the sum of posted entries on the bank account. The chain figure is confirmed only; a pending transaction the books already have is in the books figure but not yet the chain one."
    },
    onChainNotInBooks: result.chainOnly.map((t) => ({
      txid: t.txid,
      date: t.date,
      amountBtc: btc(t.netSats),
      feeBtc: t.feeSats === undefined ? undefined : btc(t.feeSats),
      drafted: draftsKnown ? drafted.has(t.txid) : "not available"
    })),
    inBooksNotOnChain: result.ledgerOnly.map((e) => ({
      postingDate: e.postingDate,
      documentNumber: e.documentNumber,
      externalDocumentNumber: e.externalDocumentNumber,
      description: e.description,
      amountBtc: btc(e.amountSats)
    })),
    amountsDiffer: differs.map((m) => ({
      txid: m.tx.txid,
      onChainBtc: btc(m.tx.netSats),
      inBooksBtc: btc(m.ledgerSats)
    })),
    pending: result.pending.map((t) => ({ txid: t.txid, amountBtc: btc(t.netSats) }))
  };
}
function draftedTxids(lines, txids) {
  const out = new Set;
  for (const line of lines) {
    const ref = line.externalDocumentNumber.toLowerCase();
    const hit = ref.length >= MIN_TXID_PREFIX ? txids.find((t) => t.startsWith(ref)) : undefined;
    if (hit)
      out.add(hit);
  }
  return out;
}

// src/lib/bitcoin/scan.ts
var GAP_LIMIT = 20;
var MAX_ADDRESSES_PER_CHAIN = 5000;
var MAX_TRANSACTIONS = 1e4;
function headerTime(headerHex) {
  const bytes = hex.decode(headerHex);
  if (bytes.length < 80)
    throw new Error("Short block header.");
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(68, true);
}
function parseRawTx(rawHex) {
  const tx = Transaction.fromRaw(hex.decode(rawHex), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    disableScriptCheck: true,
    allowLegacyWitnessUtxo: true
  });
  const inputs = [];
  for (let i = 0;i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (!input.txid || input.index === undefined)
      continue;
    inputs.push({ txid: hex.encode(input.txid), index: input.index });
  }
  const outputs = [];
  for (let i = 0;i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    outputs.push({
      script: output.script ? hex.encode(output.script) : "",
      sats: Number(output.amount ?? 0n)
    });
  }
  return { txid: tx.id, inputs, outputs };
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
async function scanWallet(descriptor, electrum, options = {}) {
  const gapLimit = options.gapLimit ?? GAP_LIMIT;
  const concurrency = options.concurrency ?? 20;
  const derive = scriptDeriver(descriptor);
  const chains = descriptor.hasChange ? ["receive", "change"] : ["receive"];
  const ours = new Map;
  const usedHashes = [];
  const history = new Map;
  const used = { receive: 0, change: 0 };
  const derived = { receive: 0, change: 0 };
  let nextReceiveIndex = 0;
  for (const chain of chains) {
    let index = 0;
    let gap = 0;
    while (gap < gapLimit) {
      if (index >= MAX_ADDRESSES_PER_CHAIN) {
        throw new Error(`Stopped after ${MAX_ADDRESSES_PER_CHAIN} addresses on the ${chain} chain.`);
      }
      const batch = Array.from({ length: gapLimit - gap }, (_, i) => derive(chain, index + i));
      const histories = await mapLimit(batch, concurrency, (s) => electrum.request("blockchain.scripthash.get_history", [
        electrumScriptHash(s.script)
      ]));
      batch.forEach((script, i) => {
        ours.set(script.script, script);
        derived[chain]++;
        const entries = histories[i] ?? [];
        if (entries.length === 0) {
          gap++;
          return;
        }
        gap = 0;
        used[chain]++;
        if (chain === "receive")
          nextReceiveIndex = Math.max(nextReceiveIndex, script.index + 1);
        usedHashes.push(electrumScriptHash(script.script));
        for (const entry of entries)
          history.set(entry.tx_hash, entry.height);
      });
      index += batch.length;
    }
  }
  const [tipHeader, balances] = await Promise.all([
    electrum.request("blockchain.headers.subscribe", []),
    mapLimit(usedHashes, concurrency, (h) => electrum.request("blockchain.scripthash.get_balance", [h]))
  ]);
  const txids = [...history.keys()];
  if (txids.length > MAX_TRANSACTIONS) {
    throw new WalletError(`This wallet has more than ${MAX_TRANSACTIONS.toLocaleString("en-GB")} transactions, more than Bookie reads live.`);
  }
  const raw = new Map;
  const fetchTxs = async (ids) => {
    const fetched = await mapLimit(ids, concurrency, (id) => electrum.request("blockchain.transaction.get", [id, false]));
    ids.forEach((id, i) => raw.set(id, parseRawTx(fetched[i])));
  };
  await fetchTxs(txids);
  const isOurInput = (input) => {
    const prev = raw.get(input.txid);
    const out = history.has(input.txid) ? prev?.outputs[input.index] : undefined;
    return out && ours.has(out.script) ? out : undefined;
  };
  const heights = [...new Set([...history.values()].filter((h) => h > 0))];
  const headers = await mapLimit(heights, concurrency, (h) => electrum.request("blockchain.block.header", [h]));
  const blockTimes = new Map(heights.map((h, i) => [h, headerTime(headers[i])]));
  const transactions = txids.map((txid) => {
    const tx = raw.get(txid);
    const height = history.get(txid);
    const pending = height <= 0;
    const receivedSats = tx.outputs.reduce((s, o) => s + (ours.has(o.script) ? o.sats : 0), 0);
    let sentSats = 0;
    let ourInputs = 0;
    for (const input of tx.inputs) {
      const mine = isOurInput(input);
      if (mine) {
        sentSats += mine.sats;
        ourInputs++;
      }
    }
    const outputTotal = tx.outputs.reduce((s, o) => s + o.sats, 0);
    const allInputsOurs = ourInputs > 0 && ourInputs === tx.inputs.length;
    const feeSats = allInputsOurs && sentSats >= outputTotal ? sentSats - outputTotal : undefined;
    const sharedInputs = ourInputs > 0 && !allInputsOurs;
    const netSats = receivedSats - sentSats;
    const allOurs = tx.outputs.every((o) => ours.has(o.script));
    return {
      txid,
      height: pending ? undefined : height,
      blockTime: pending ? undefined : blockTimes.get(height),
      confirmations: pending ? 0 : Math.max(0, tipHeader.height - height + 1),
      pending,
      receivedSats,
      sentSats,
      netSats,
      feeSats,
      ...sharedInputs ? { sharedInputs } : {},
      direction: sentSats > 0 && allOurs ? "self" : netSats >= 0 ? "in" : "out"
    };
  });
  transactions.sort((a, b) => {
    if (a.pending !== b.pending)
      return a.pending ? -1 : 1;
    return (b.height ?? 0) - (a.height ?? 0) || a.txid.localeCompare(b.txid);
  });
  return {
    tip: { height: tipHeader.height, time: tipHeader.hex ? headerTime(tipHeader.hex) : undefined },
    transactions,
    balance: {
      confirmedSats: balances.reduce((s, b) => s + (b?.confirmed ?? 0), 0),
      pendingSats: balances.reduce((s, b) => s + (b?.unconfirmed ?? 0), 0)
    },
    used,
    derived,
    nextReceiveIndex,
    scannedAt: (options.now?.() ?? new Date).toISOString()
  };
}

// scripts/agent-btc-wallet.ts
var BC = "https://api.businesscentral.dynamics.com";
var LEDGER_API = "knowallBookie/bookie/v1.0";
var BITCOIN_API = "bookie/bitcoin/v1.0";

class Refusal extends Error {
}
var decodeBcEnum = (value) => (value ?? "").replace(/_x([0-9A-F]{4})_/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).trim();
function loadEnv() {
  const file = join(homedir(), ".hermes", ".env");
  if (!existsSync(file))
    return;
  for (const line of readFileSync(file, "utf8").split(`
`)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined)
      continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
function need(name) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Refusal(`${name} is not set (in the environment or ~/.hermes/.env).`);
  return value;
}
var btc2 = (sats) => Number(satsToBtc(sats).replace(/,/g, ""));
async function bcToken() {
  const tenant = need("BC_TENANT_ID");
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: need("BC_CLIENT_ID"),
      client_secret: need("BC_CLIENT_SECRET"),
      scope: `${BC}/.default`
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token)
    throw new Refusal("Business Central sign-in failed.");
  return body.access_token;
}
function bcApi(token) {
  const root = `${BC}/v2.0/${need("BC_TENANT_ID")}/${encodeURIComponent(need("BC_ENVIRONMENT"))}/api`;
  const get = async (url) => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const error = new Refusal(`Business Central returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  };
  const all = async (url) => {
    const rows = [];
    let next = url;
    for (let page = 0;next && page < 20; page++) {
      const body = await get(next);
      rows.push(...body.value);
      next = body["@odata.nextLink"];
    }
    return rows;
  };
  return { root, get, all };
}
var SCRIPT_TYPES = {
  WPKH: "wpkh",
  SHWPKH: "sh-wpkh",
  TR: "tr",
  WSHMulti: "wsh-multi",
  PKH: "pkh"
};
async function openCompany(companyName) {
  const api = bcApi(await bcToken());
  const companies = await api.all(`${api.root}/v2.0/companies?$select=id,name,displayName`);
  const company = companies.find((c) => c.name === companyName || c.displayName === companyName);
  if (!company)
    throw new Refusal(`No Business Central company called "${companyName}".`);
  const url = (route, path) => `${api.root}/${route}/companies(${company.id})/${path}`;
  const baseCurrency = async () => {
    const info = await api.get(url("v2.0", "companyInformation")).catch(() => {
      return;
    });
    const fromInfo = info?.value[0]?.currencyCode?.trim();
    if (fromInfo)
      return fromInfo.toUpperCase();
    const setup = await api.get(url(LEDGER_API, "companySetup")).catch(() => {
      return;
    });
    return setup?.value[0]?.lcyCode?.trim().toUpperCase() || undefined;
  };
  return { api, url, baseCurrency, company: company.displayName || company.name };
}
async function bcWallets(companyName) {
  const bc = await openCompany(companyName);
  try {
    const rows = await bc.api.all(bc.url(BITCOIN_API, "bitcoinWallets"));
    return { bc, rows: rows.filter((r) => r.bitcoinWalletDescriptor?.trim()) };
  } catch (error) {
    const status = error.status;
    if (status === 404) {
      throw new Refusal("The Bookie Bitcoin extension is not installed in this Business Central environment.");
    }
    if (status === 403) {
      throw new Refusal("My Business Central app has no BOOKIE BTC READ permission set.");
    }
    throw error;
  }
}
function describe(row) {
  try {
    const parsed = parseWalletInput(row.bitcoinWalletDescriptor ?? "", SCRIPT_TYPES[row.bitcoinScriptType ?? ""]);
    return { parsed, summary: { type: describeWallet(parsed), network: parsed.network } };
  } catch (error) {
    return { summary: { problem: `The descriptor can't be used: ${error.message}` } };
  }
}
function pick(rows, wanted) {
  if (!wanted)
    return rows;
  const w = wanted.toLowerCase();
  const hit = rows.filter((r) => r.number.toLowerCase() === w || (r.displayName ?? "").toLowerCase() === w);
  if (hit.length === 0)
    throw new Refusal(`No Bitcoin wallet "${wanted}" in this company.`);
  return hit;
}
async function scan(row) {
  const { parsed, summary } = describe(row);
  if (!parsed)
    throw new Refusal("problem" in summary ? summary.problem : "Unusable descriptor.");
  if (parsed.network !== "mainnet")
    throw new Refusal("This is a testnet wallet.");
  const server = parseElectrumUrl(need("BOOKIE_ELECTRUM_URL"));
  if (server.protocol !== "ssl") {
    throw new Refusal("BOOKIE_ELECTRUM_URL must be ssl://host:port: I only use TLS.");
  }
  const client = await ElectrumClient.connect(server, {
    certSha256: process.env.BOOKIE_ELECTRUM_CERT_SHA256?.trim() || undefined
  });
  try {
    return await scanWallet(parsed, client);
  } finally {
    client.close();
  }
}
async function list(company) {
  const { bc, rows } = await bcWallets(company);
  return {
    company: bc.company,
    wallets: rows.map((r) => ({
      bankAccount: r.number,
      name: r.displayName,
      currency: r.currencyCode || "the company’s local currency",
      ...describe(r).summary
    }))
  };
}
async function show(company, wanted, limit, withValues) {
  const { bc, rows } = await bcWallets(company);
  const [row] = pick(rows, wanted);
  const result = await scan(row);
  const shown = result.transactions.slice(0, limit);
  const times = shown.flatMap((t) => t.blockTime ? [t.blockTime] : []);
  const currency = withValues ? await bc.baseCurrency() : undefined;
  const rates = withValues ? await ratesForBlockTimes(times, currency) : undefined;
  return {
    wallet: row.displayName,
    bankAccount: row.number,
    readAtBlock: result.tip.height,
    ...withValues ? {
      valuesIn: currency ?? "not available: Business Central didn't report the base currency",
      valuesNote: "Worth at the time, from Kraken, for information only: Business Central posts at its own daily rate, so these won't match the books exactly."
    } : {},
    balance: {
      confirmedBtc: btc2(result.balance.confirmedSats),
      pendingBtc: btc2(result.balance.pendingSats),
      ...withValues ? { confirmedValue: await valueNow(result.balance.confirmedSats, currency) } : {}
    },
    transactions: shown.map((t) => {
      const rate = t.blockTime ? rates?.get(t.blockTime) : undefined;
      return {
        txid: t.txid,
        date: txDate(t),
        status: t.pending ? "pending (unconfirmed, not settled)" : "confirmed",
        confirmations: t.confirmations,
        amountBtc: btc2(t.netSats),
        feeBtc: t.feeSats === undefined ? "not available" : btc2(t.feeSats),
        ...withValues ? {
          value: !t.blockTime ? { ok: false, reason: "Pending: no block time, so no rate." } : typeof rate === "object" ? valueFor(t.netSats, rate) : { ok: false, reason: rate ?? "Kraken prices are unavailable." }
        } : {}
      };
    }),
    more: result.transactions.length > limit ? result.transactions.length - limit : 0
  };
}
async function reconcileWallets(company, wanted) {
  const { bc, rows } = await bcWallets(company);
  const journals = await bc.api.all(bc.url("v2.0", "journals?$select=id,code,displayName")).catch(() => {
    return;
  });
  const btcBatches = journals?.filter((j) => j.code.startsWith("BTC") && j.displayName === "Bookie Bitcoin reconcile");
  const results = [];
  for (const row of pick(rows, wanted)) {
    try {
      if (row.currencyCode !== "BTC") {
        throw new Refusal(`Bank account ${row.number} is not in BTC, so it can't be reconciled.`);
      }
      const chain = await scan(row);
      const filter = encodeURIComponent(`bankAccountNumber eq '${row.number.replace(/'/g, "''")}'`);
      const ledger = (await bc.api.all(bc.url(LEDGER_API, `bankAccountLedgerEntries?$filter=${filter}`)).catch((error) => {
        if (error.status === 404) {
          throw new Refusal("Reconciling needs the Bookie BC API extension as well.");
        }
        throw error;
      })).filter((e) => !e.reversed).map((e) => ({
        id: e.id,
        entryNumber: e.entryNumber,
        postingDate: e.postingDate.slice(0, 10),
        documentNumber: e.documentNumber || undefined,
        externalDocumentNumber: e.externalDocumentNumber || undefined,
        description: e.description || undefined,
        amountSats: Math.round(e.amount * 1e8)
      }));
      const batchLines = btcBatches ? await Promise.all(btcBatches.map((b) => bc.api.all(bc.url("v2.0", `journals(${b.id})/journalLines`)).catch(() => {
        return;
      }))) : undefined;
      const isThisBank = (l) => decodeBcEnum(l.accountType) === "Bank Account" && l.accountNumber === row.number;
      const draftLines = batchLines && batchLines.every(Boolean) ? batchLines.filter((lines) => lines.length > 0 && lines.every(isThisBank)).flat().map((l) => ({ externalDocumentNumber: l.externalDocumentNumber ?? "" })) : undefined;
      const txids = chain.transactions.map((t) => t.txid);
      results.push(summariseReconcile({
        wallet: row.displayName ?? row.number,
        bankAccountNumber: row.number,
        scan: chain,
        result: reconcile(chain.transactions, ledger),
        ledgerSats: ledger.reduce((s, e) => s + e.amountSats, 0),
        drafted: draftLines ? [
          ...draftedTxids(draftLines.map((l) => ({
            bankAccountNumber: row.number,
            postingDate: "",
            documentNumber: "",
            externalDocumentNumber: l.externalDocumentNumber,
            description: "",
            amountSats: 0,
            balancingAccountNumber: ""
          })), txids)
        ] : "not available"
      }));
    } catch (error) {
      results.push({
        wallet: row.displayName ?? row.number,
        status: "unavailable",
        reason: error instanceof Error ? error.message : "The reconcile failed."
      });
    }
  }
  return { company: bc.company, wallets: results };
}
async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    if (i === -1)
      return;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i !== -1)
      args.splice(i, 1);
    return i !== -1;
  };
  const company = option("--company") ?? need("BC_COMPANY");
  const limit = Math.min(500, Math.max(1, Number(option("--limit") ?? 50) || 50));
  const withValues = flag("--value");
  const [command, wallet] = args;
  let output;
  if (command === "list")
    output = await list(company);
  else if (command === "show" && wallet)
    output = await show(company, wallet, limit, withValues);
  else if (command === "reconcile")
    output = await reconcileWallets(company, wallet);
  else {
    throw new Refusal('Usage: btc-wallet.mjs list | show <wallet> [--limit N] [--value] | reconcile [<wallet>]  [--company "<name>"]');
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}
`);
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : "Failed.";
  process.stdout.write(`${JSON.stringify({ error: message })}
`);
  process.exit(1);
});
