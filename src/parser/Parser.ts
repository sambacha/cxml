// This file is part of cxml, copyright (c) 2016-2017 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import "source-map-support/register";
import { defaultsDeep, keys, toPairs } from "lodash";
import * as stream from "stream";
import * as Promise from "bluebird";
import * as sax from "sax";

import { Context } from "../xml/Context";
import { Namespace } from "../xml/Namespace";
import { Rule, RuleClass, HandlerInstance } from "./Rule";
import { MemberRef } from "../xml/MemberRef";
import { State } from "./State";
import { defaultContext } from "../importer/JS";
import { parse, ItemParsed } from "../topublish/xpath";

// TODO is the type definition as correct as it can be?
/*
{
	xpathEl(obj): {
 	  _before: Function,
 	  _after: Function,
		xpathEl(obj): {
			_before: Function,
			_after: Function,
		}(Map),
	}(Map)
}(Map)
//*/
export type AttachmentNames = "_after" | "_before";
export type BTreeFinal = Map<AttachmentNames, Function>;
export type BTreeIntermediate<T> = Map<ItemParsed, T | BTreeFinal>;
export type BTree<T> = BTreeIntermediate<T> & BTreeFinal;

export interface CxmlDate extends Date {
  cxmlTimezoneOffset: number;
}

function getPath(state: State, acc: string[] = []): string[] {
  const name =
    state.memberRef && state.memberRef.member && state.memberRef.member.name;
  acc.unshift(name);
  const parent = state.parent;
  if (!!parent) {
    return getPath(parent, acc);
  } else {
    return acc;
  }
}

function findInMapIter<T>(
  mapIter: Iterator<[ItemParsed, any]>,
  compare: (x: ItemParsed) => boolean
): BTree<T> {
  const next = mapIter.next();
  const { value, done } = next;
  if (!value) {
    return;
  }
  const [k, v] = value;
  if (!compare(k)) {
    if (done) {
      return;
    }
    return findInMapIter<T>(mapIter, compare);
  } else {
    return v;
  }
}

/*
function findEntry<T>(
  mapIter: Iterator<[ItemParsed, any]>,
  compare: (x: ItemParsed) => boolean
): [ItemParsed, any] {}
//*/

function findEntry(
  mapIter: any,
  compare: (x: any) => boolean
): [Map<string, any>, any] {
  const entry = mapIter.next();
  const { value, done } = entry;
  if (!value) {
    return;
  }
  const [k, v] = value;
  if (!compare(k)) {
    if (done) {
      return;
    }
    return findEntry(mapIter, compare);
  } else {
    return [k, v];
  }
}

function getAttached<T>(
  state: State,
  bTree: BTree<T>,
  attachment: AttachmentNames
): any {
  const name =
    !!state.memberRef &&
    !!state.memberRef.member &&
    state.memberRef.member.name;

  if (!name) {
    // NOTE: because of how the state is defined for _before vs. _after,
    // we expect to not have name for _after but not for _before
    if (attachment === "_before") {
      console.warn(
        `Missing state.memberRef.member.name in getAttached for ${attachment}`
      );
      console.log("state");
      console.log(state);
      console.log("bTree");
      console.log(bTree);
    }
    const attached = bTree.get(attachment);
    if (attached) {
      return attached;
    } else {
      throw new Error("Missing attached in getAttached");
    }
  }

  const value = findInMapIter(bTree.entries(), function(k: ItemParsed) {
    return k["name"] === name;
  });

  if (!value) {
    // NOTE: we can end up here because there is no direct connection between
    // a Parser instance's attach and _parse methods. They actually just
    // connect via the rule.handler prototype. So it's possible for one
    // attachment to set something on the rule.handler prototype, meaning it
    // appears to exist when we look at item._before or item._after in _parser,
    // but it doesn't actually exist for this xpath when we match the
    // state and bTree, level by level, up to the point where there should be
    // a _before or _after.
    return;
  }

  const parent = state.parent;
  if (!!parent) {
    return getAttached(parent, value, attachment);
  } else {
    return value.get(attachment);
  }
}

var converterTbl: { [type: string]: (item: string) => any } = {
  Date: (item: string) => {
    var dateParts = item.match(
      /([0-9]+)-([0-9]+)-([0-9]+)(?:T([0-9]+):([0-9]+):([0-9]+)(\.[0-9]+)?)?(?:Z|([+-][0-9]+):([0-9]+))?/
    );

    if (!dateParts) return null;

    var offsetMinutes = +(dateParts[9] || "0");
    var offset = +(dateParts[8] || "0") * 60;

    if (offset < 0) offsetMinutes = -offsetMinutes;

    offset += offsetMinutes;

    var date = new Date(
      +dateParts[1],
      +dateParts[2] - 1,
      +dateParts[3],
      +(dateParts[4] || "0"),
      +(dateParts[5] || "0"),
      +(dateParts[6] || "0"),
      +(dateParts[7] || "0") * 1000
    ) as CxmlDate;

    date.setTime(date.getTime() - (offset + date.getTimezoneOffset()) * 60000);
    date.cxmlTimezoneOffset = offset;

    return date;
  },
  boolean: (item: string) => item == "true",
  string: (item: string) => item,
  number: (item: string) => +item
};

function convertPrimitive(text: string, type: Rule) {
  var converter = converterTbl[type.primitiveType];

  if (converter) {
    if (type.isList) {
      return text.trim().split(/\s+/).map(converter);
    } else {
      return converter(text.trim());
    }
  }

  return null;
}

export class Parser {
  bTree: any = new Map();
  attach<CustomHandler extends HandlerInstance>(
    handler: {
      new (): CustomHandler;
    },
    xpath: string
  ) {
    var proto = handler.prototype as CustomHandler;
    var realHandler = (handler as RuleClass).rule.handler;
    var realProto = realHandler.prototype as CustomHandler;

    for (var key of Object.keys(proto)) {
      if (["_before", "_after"].indexOf(key) === -1) {
        realProto[key] = proto[key];
      }
    }

    // TODO is this really the best way to do this?
    const { _before, _after } = proto;
    if (xpath) {
      if (_before || _after) {
        const parsedXPathR = parse(xpath).reverse();
        const finalItem = parsedXPathR.reduce(function(parentNode, xpathEl) {
          const xpathElPairs = toPairs(xpathEl);
          let [currentNode, currentValue]: [
            Map<string, any>,
            ItemParsed
          ] = findEntry(parentNode.entries(), function(candidateValue) {
            console.log("candidateValue");
            console.log(candidateValue);
            return xpathElPairs.reduce(function(
              isRunningMatch: boolean,
              [xpathElKey, xpathElValue]
            ) {
              return (
                isRunningMatch && candidateValue[xpathElKey] === xpathElValue
              );
            }, true);
          }) || [new Map(), xpathEl];
          parentNode.set(currentValue, currentNode);
          return currentNode;
        }, this.bTree);

        if (_before) {
          finalItem.set("_before", _before);
        }
        if (_after) {
          finalItem.set("_after", _after);
        }
      }
    }

    realHandler._custom = true;
  }

  parse<Output extends HandlerInstance>(
    stream: string | stream.Readable | NodeJS.ReadableStream,
    output: Output,
    context?: Context
  ) {
    return new Promise<
      Output
    >((resolve: (item: Output) => void, reject: (err: any) => void) =>
      this._parse<Output>(
        stream,
        output,
        context || defaultContext,
        resolve,
        reject
      )
    );
  }

  _parse<Output extends HandlerInstance>(
    stream: string | stream.Readable | NodeJS.ReadableStream,
    output: Output,
    context: Context,
    resolve: (item: Output) => void,
    reject: (err: any) => void
  ) {
    const { bTree } = this;
    var xml = sax.createStream(true, { position: true });
    let rule = (output.constructor as RuleClass).rule;
    var xmlSpace = context.registerNamespace(
      "http://www.w3.org/XML/1998/namespace"
    );

    let namespaceTbl: { [short: string]: [Namespace, string] } = {
      "": [rule.namespace, rule.namespace.getPrefix()],
      xml: [xmlSpace, xmlSpace.getPrefix()]
    };

    var state = new State(null, null, rule, new rule.handler(), namespaceTbl);
    var rootState = state;
    let parentItem: HandlerInstance;

    /** Add a new xmlns prefix recognized inside current tag and its children. */

    function addNamespace(short: string, namespace: Namespace) {
      if (namespaceTbl[short] && namespaceTbl[short][0] == namespace) return;

      if (namespaceTbl == state.namespaceTbl) {
        // Copy parent namespace table on first write.
        namespaceTbl = {};

        for (let key of Object.keys(state.namespaceTbl)) {
          namespaceTbl[key] = state.namespaceTbl[key];
        }
      }

      namespaceTbl[short] = [namespace, namespace.getPrefix()];
    }

    xml.on("opentag", (node: sax.Tag) => {
      var attrTbl = node.attributes;
      var attr: string;
      var nodePrefix = "";
      var name = node.name;
      var splitter = name.indexOf(":");
      var item: HandlerInstance = null;

      namespaceTbl = state.namespaceTbl;

      // Read xmlns namespace prefix definitions before parsing node name.

      for (var key of Object.keys(attrTbl)) {
        if (key.substr(0, 5) == "xmlns") {
          var nsParts = key.match(/^xmlns(:(.+))?$/);

          if (nsParts) {
            addNamespace(
              nsParts[2] || "",
              context.registerNamespace(attrTbl[key])
            );
          }
        }
      }

      // Parse node name and possible namespace prefix.

      if (splitter >= 0) {
        nodePrefix = name.substr(0, splitter);
        name = name.substr(splitter + 1);
      }

      // Add internal surrogate key namespace prefix to node name.

      var nodeNamespace = namespaceTbl[nodePrefix];
      name = nodeNamespace[1] + name;

      var child: MemberRef;
      let rule: Rule;

      if (state.rule) {
        child = state.rule.childTbl[name];

        if (child) {
          if (child.proxy) {
            rule = child.proxy.member.rule;
            state = new State(
              state,
              child.proxy,
              rule,
              new rule.handler(),
              namespaceTbl
            );
          }

          rule = child.member.rule;
        }
      }

      if (rule && !rule.isPlainPrimitive) {
        item = new rule.handler();

        // Parse all attributes.

        for (var key of Object.keys(attrTbl)) {
          splitter = key.indexOf(":");

          if (splitter >= 0) {
            var attrPrefix = key.substr(0, splitter);
            if (attrPrefix == "xmlns") continue;

            var attrNamespace = namespaceTbl[attrPrefix];

            if (attrNamespace) {
              attr = attrNamespace[1] + key.substr(splitter + 1);
            } else {
              console.warn("Namespace not found for " + key);
              continue;
            }
          } else {
            attr = nodeNamespace[1] + key;
          }

          var ref = rule.attributeTbl[attr];

          if (ref && ref.member.rule.isPlainPrimitive) {
            item[ref.safeName] = convertPrimitive(
              attrTbl[key],
              ref.member.rule
            );
          }
        }

        if (state.parent) {
          Object.defineProperty(item, "_parent", {
            enumerable: false,
            value: state.parent.item
          });
        }

        Object.defineProperty(item, "_name", {
          enumerable: false,
          value: node.name
        });

        const altState = { ...state, memberRef: child };
        const thisBefore = getAttached(altState, bTree, "_before");
        if (!!thisBefore) {
          thisBefore.call(item);
        }
      }

      state = new State(state, child, rule, item, namespaceTbl);
    });

    xml.on("text", function(text: string) {
      if (state.rule && state.rule.isPrimitive) {
        if (!state.textList) state.textList = [];
        state.textList.push(text);
      }
    });

    xml.on("closetag", function(name: string) {
      var member = state.memberRef;
      var obj = state.item;
      var item: any = obj;
      var text: string;

      if (state.rule && state.rule.isPrimitive)
        text = (state.textList || []).join("").trim();

      if (text) {
        var content = convertPrimitive(text, state.rule);

        if (state.rule.isPlainPrimitive) item = content;
        else obj.content = content;
      }

      if (obj) {
        const thisAfter = getAttached(state, bTree, "_after");
        if (!!thisAfter) {
          thisAfter.call(obj);
        }
      }

      state = state.parent;

      if (member && member.proxy) {
        if (item) state.item[member.safeName] = item;
        item = state.item;

        state = state.parent;
        member = member.proxy;
      }

      if (item) {
        var parent = state.item;

        if (parent) {
          if (member.max > 1) {
            if (!parent.hasOwnProperty(member.safeName))
              parent[member.safeName] = [];
            parent[member.safeName].push(item);
          } else parent[member.safeName] = item;
        }
      }
    });

    xml.on("end", function() {
      resolve((rootState.item as any) as Output);
    });

    xml.on("error", function(err: any) {
      console.error(err);
    });

    if (typeof stream == "string") {
      xml.write(stream as string);
      xml.end();
    } else (stream as stream.Readable).pipe(xml);
  }
}
