declare type NullOrString = null | string;

//declare function peg$SyntaxError(message, expected, found, location): void;
//declare function peg$SyntaxError(message, expected, found, location): void;
interface peg$SyntaxError {
  (message: any, expected: any, found: any, location: any): void;
  buildMessage: (expected: any, found: any) => string;
}
//import * as XPathParser from './XPathParser';
//import XPathParser = require('./XPathParser');
declare module "XPathParser" {
  //export = parse;
  export const parse: (xpath: string, opts?: any) => NullOrString[][];
  export const SyntaxError: peg$SyntaxError;
}
