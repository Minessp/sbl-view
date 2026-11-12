/**
 * Acesso indexado com checagem de faixa. Com `noUncheckedIndexedAccess`, isto substitui
 * o `a[i]!`: se o índice estiver errado, falha alto em vez de propagar `undefined`/NaN.
 */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`índice ${i} fora de [0, ${arr.length})`);
  return v;
}

export const first = <T>(arr: ArrayLike<T>): T => at(arr, 0);
export const last = <T>(arr: ArrayLike<T>): T => at(arr, arr.length - 1);

/** Map.get que falha alto. */
export function must<K, V>(map: ReadonlyMap<K, V>, key: K, what = 'chave'): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(`${what} desconhecida: ${String(key)}`);
  return v;
}
