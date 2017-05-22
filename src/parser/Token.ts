import { Namespace } from '../Namespace';

export const enum TokenKind {
	// Internal token types
	uri,
	prefix,
	element,
	attribute,

	// External element token types
	open,
	close,
	emitted,

	// External attribute token types
	string,
	number
}

export class Token {

	constructor(public name: string, public ns: Namespace) {}

	kind: TokenKind;

}

export class OpenToken extends Token {
	emitted = new EmittedToken(this.name, this.ns);
	close = new CloseToken(this.name, this.ns);
}
OpenToken.prototype.kind = TokenKind.open;

export class CloseToken extends Token {}
CloseToken.prototype.kind = TokenKind.close;

export class EmittedToken extends Token {}
EmittedToken.prototype.kind = TokenKind.emitted;

export class StringToken extends Token {}
StringToken.prototype.kind = TokenKind.string;