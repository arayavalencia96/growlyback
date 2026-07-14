export interface IResult<T> {
  result: T;
  message: string;
  description: string;
  statuscode: number;
  ok: boolean;
}
