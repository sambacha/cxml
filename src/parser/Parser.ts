// This file is part of cxml, copyright (c) 2016-2017 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import "source-map-support/register";
import { keys, toPairs } from "lodash";
import * as stream from "stream";
import * as Promise from "bluebird";
import * as sax from "sax";

import { Context } from "../xml/Context";
import { Namespace } from "../xml/Namespace";
import { Rule, RuleClass, HandlerInstance } from "./Rule";
import { MemberRef } from "../xml/MemberRef";
import { State } from "./State";
import { defaultContext } from "../importer/JS";
import { parse } from "../topublish/xpath";

import * as CircularJSON from "circular-json";

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

function findInMapIter(mapIter: any, compare: (x: any) => boolean): any {
  //console.log("findInMapIter/mapIter37");
  //console.log(mapIter);
  const next = mapIter.next();
  //console.log("findInMapIter/next");
  //console.log(next);
  const { value, done } = next;
  //console.log(`findInMapIter/done: ${done}`);
  //console.log("findInMapIter/value40");
  //console.log(value);
  if (!value) {
    return;
  }
  //console.log("value38");
  //console.log(value);
  const [k, v] = value;
  if (!compare(k)) {
    if (done) {
      //console.log(`done: ${done}`);
      return;
    }
    return findInMapIter(mapIter, compare);
  } else {
    return v;
  }
}

function findEntry(
  mapIter: any,
  compare: (x: any) => boolean
): [any, any] | any[] {
  //console.log("findEntry/mapIter63");
  //console.log(mapIter);
  const entry = mapIter.next();
  //console.log("entry63");
  //console.log(entry);
  const { value, done } = entry;
  //console.log("value69");
  //console.log(value);
  if (!value) {
    return [];
  }
  //console.log("value74");
  //console.log(value);
  const [k, v] = value;
  if (!compare(k)) {
    if (done) {
      //console.log(`done79: ${done}`);
      return [];
    }
    return findEntry(mapIter, compare);
  } else {
    return [k, v];
  }
}

function getAttached(state: State, bTree: any, attachment: string): any {
  console.log("getAttached/state");
  console.log(state);
  console.log("getAttached/bTree");
  console.log(bTree);
  console.log(`getAttached/attachment: ${attachment}`);
  const name =
    state.memberRef && state.memberRef.member && state.memberRef.member.name;
  const parent = state.parent;

  if (!name || !parent) {
    const attached = bTree.get(attachment);
    if (attached) {
      return attached;
    }
  }

  /*
  const mapIter = bTree.entries();
	mapIter.next().value
	//*/

  console.log(`getAttached/name97: ${name}`);
  const value = findInMapIter(bTree.entries(), function(k: any) {
    return k["name"] === name;
  });
  console.log("getAttached/value104");
  console.log(value);
  /*
  for (var [key, value] of bTree.entries()) {
    console.log(key + " = " + value);
  }
	//*/

  /*
  console.log(
    bTree.get({
      axis: "/",
      namespace: null,
      name: "Comment",
      predicates: undefined,
      attribute: null
    })
  );
	//*/

  if (!value) {
    return;
  } else if (!!parent) {
    console.log("getAttached/parent");
    console.log(parent);
    const parentBTree = bTree.get(value);
    return getAttached(parent, value, attachment);
  } else {
    const aFn = bTree.get(attachment);
    console.log("getAttached/aFn");
    console.log(aFn);
    return aFn;
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

export class Parser {
  _before: { [key: string]: Function } = {};
  _after: { [key: string]: Function } = {};
  bTree: any = new Map();
  _beforeBTree: any = new Map();
  _afterBTree: any = new Map();
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
      realProto[key] = proto[key];
    }

    // TODO is this really the best way
    // to do this?
    let { _before, _after } = this;
    if (xpath) {
      /*
			const _befores = keys(_before || {}).map(function(b) {
				const components = b.split("/");
			});
			//*/

      if (realProto._before || realProto._after) {
        const parsedXPathR = parse(xpath).reverse();
        //const finalItem = parsedXPathR.pop();
        //const finalItem = parsedXPathR[parsedXPathR.length - 1];
        const finalItem = parsedXPathR.reduce(function(parentNode, xpathEl) {
          //console.log("xpathEl");
          //console.log(xpathEl);
          // TODO finish building a BTree to follow to get _before and _before functions.
          const xpathElPairs = toPairs(xpathEl);
          //console.log("xpathElPairs");
          //console.log(xpathElPairs);
          let [
            currentNode,
            currentValue
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
          });
          currentNode = currentNode || new Map();
          currentValue = currentValue || xpathEl;
          parentNode.set(currentValue, currentNode);
          return currentNode;
        }, this.bTree);

        /*
        const _beforeFinalItem = parsedXPathR.reduce(function(acc, item) {
          // TODO finish building a BTree to follow to get _before and _before functions.
          let current = acc.get(item) || new Map();
          acc.set(item, current);
          return current;
        }, this._beforeBTree);

        const _afterFinalItem = parsedXPathR.reduce(function(acc, item) {
          // TODO finish building a BTree to follow to get _before and _after functions.
          let current = acc.get(item) || new Map();
          acc.set(item, current);
          return current;
        }, this._afterBTree);
				//*/

        if (realProto._before) {
          finalItem.set("_before", realProto._before);
          //_beforeFinalItem.set("_before", realProto._before);
        }
        if (realProto._after) {
          finalItem.set("_after", realProto._after);
          //_afterFinalItem.set("_after", realProto._after);
        }
        console.log("this.bTree");
        console.log(this.bTree);
        /*
        console.log("this._beforeBTree");
        console.log(this._beforeBTree);
        console.log("this._afterBTree");
        console.log(this._afterBTree);
				//*/
      }
      /*
      if (realProto._before) {
        _before[xpath] = realProto._before;
      }
      if (realProto._after) {
        _after[xpath] = realProto._after;
      }
			//*/
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
    const { _before, _after, bTree } = this;
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

      //console.log("rule422");
      //console.log(rule);
      if (rule && !rule.isPlainPrimitive) {
        console.log("opentag424");
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
              console.log("Namespace not found for " + key);
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

        console.log("item468");
        console.log(item);
        //if (item._before) item._before();
        if (item._before) {
          //console.log("state");
          //console.log(state);
          //console.log(CircularJSON.stringify(state, null, "  "));
          //console.log("bTree");
          //console.log(bTree);
          console.log("_before is on item");
          const thisBefore = getAttached(state, bTree, "_before");
          if (!!thisBefore) {
            console.log("thisBefore");
            console.log(thisBefore);
          }
          /*
          const tagName = getPath(state).join("/");
          console.log(`tagName _before: ${tagName}`);
          console.log("state _before");
          console.log(state);
          if (_before[tagName]) {
            _before[tagName].call(item);
          }
					//*/
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

      if (obj && obj._after) {
        const thisAfter = getAttached(state, bTree, "_after");
        if (!!thisAfter) {
          console.log("thisAfter");
          console.log(thisAfter);
          thisAfter.call(obj);
        }
        /*
        const tagName = getPath(state).join("/");
        if (_after[tagName]) {
          _after[tagName].call(obj);
        }
				//*/
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
