import type { FormFieldType } from './types.js'
;

type FieldValueType<T extends string> = T extends 'number'
  ? number
  : T extends 'checkbox'
    ? boolean
    : string;

type InferSingleField<F extends { name: string; type: string; required: boolean }> =
  F['required'] extends true
    ? { [K in F['name']]: FieldValueType<F['type']> }
    : { [K in F['name']]?: FieldValueType<F['type']> };

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/** Infer submit payload type from codegen `fields as const` array. Always includes required email. */
export type InferSubmitData<
  Fields extends readonly { name: string; type: string; required: boolean }[],
> = { email: string } & UnionToIntersection<InferSingleField<Fields[number]>>;

export type { FormFieldType };
