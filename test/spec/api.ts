import * as cxml from "../..";
import * as Promise from "bluebird";
var fs = require("fs");
var path = require("path");
import * as gpml from "../xmlns/pathvisio.org/GPML/2013a";
import * as example from "../xmlns/dir-example";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20 * 1000;

test("parse string", done => {
  expect.assertions(8);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      /** Fires when the opening <dir> and attributes have been parsed. */

      _before() {
        expect(this).toEqual({ name: "empty" });
      }

      /** Fires when the closing </dir> and children have been parsed. */

      _after() {
        expect(this).toEqual({ name: "empty" });
      }
    }
  );

  const result = parser.parse('<dir name="empty"></dir>', example.document);

  result.then((doc: example.document) => {
    expect(doc).toEqual({ dir: { name: "empty" } });
    var dir = doc.dir;

    // TODO why doesn't this pass?
    //expect(dir instanceof example.document.dir.constructor).toBe(true);
    expect(dir instanceof example.document.file.constructor).toBe(false);

    expect(dir instanceof example.DirType).toBe(true);
    expect(dir instanceof example.FileType).toBe(false);

    expect(dir._exists).toBe(true);
    expect(dir.file[0]._exists).toBe(false);

    done();
  });
});

test("parse stream", done => {
  expect.assertions(3);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      /** Fires when the opening <dir> and attributes have been parsed. */

      _before() {
        expect(this.name).toBe("123");
      }

      /** Fires when the closing </dir> and children have been parsed. */

      _after() {
        expect(this).toEqual({
          name: "123",
          owner: "me",
          file: [{ name: "test", size: 123, content: "data" }]
        });
      }
    }
  );

  const result = parser.parse(
    fs.createReadStream(path.resolve(__dirname, "../xml/dir-example.xml")),
    example.document
  );

  result.then((doc: example.document) => {
    expect(doc).toEqual({
      dir: {
        name: "123",
        owner: "me",
        file: [
          {
            name: "test",
            size: 123,
            content: "data"
          }
        ]
      }
    });
    done();
  });
});

test("parse string and stream w/ parser attachments", done => {
  expect.assertions(11);

  var parser = new cxml.Parser();

  parser.attach(
    class DirHandler extends example.document.dir.constructor {
      /** Fires when the opening <dir> and attributes have been parsed. */

      _before() {
        expect(typeof this.name).toBe("string");
      }

      /** Fires when the closing </dir> and children have been parsed. */

      _after() {
        expect(typeof this.name).toBe("string");
      }
    }
  );

  const resultFromString = parser.parse(
    '<dir name="empty"></dir>',
    example.document
  );

  const resultFromStream = parser.parse(
    fs.createReadStream(path.resolve(__dirname, "../xml/dir-example.xml")),
    example.document
  );

  Promise.all([resultFromString, resultFromStream]).then(function(
    [docFromString, docFromStream]: [example.document, example.document]
  ) {
    expect(docFromString).toEqual({ dir: { name: "empty" } });

    var dirFromString = docFromString.dir;

    // TODO why doesn't this pass?
    //expect(dirFromString instanceof example.document.dir.constructor).toBe(true);
    expect(dirFromString instanceof example.document.file.constructor).toBe(
      false
    );

    expect(dirFromString instanceof example.DirType).toBe(true);
    expect(dirFromString instanceof example.FileType).toBe(false);

    expect(dirFromString._exists).toBe(true);
    expect(dirFromString.file[0]._exists).toBe(false);

    expect(docFromStream).toEqual({
      dir: {
        name: "123",
        owner: "me",
        file: [
          {
            name: "test",
            size: 123,
            content: "data"
          }
        ]
      }
    });
    done();
  });
});

test("attach to and parse broken Pathway from string", done => {
  expect.assertions(1);

  var parser = new cxml.Parser();
  parser.attach(
    class CustomHandler extends gpml.document.Pathway.constructor {
      _before() {
        /*
        console.log("Before:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }

      _after() {
        /*
        console.log("After:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }
    }
  );
  var result = parser.parse(
    '<DataNode name="sample pathway"><Comment>hello there</Comment></DataNode>',
    gpml.document
  );
  result.then(doc => {
    /*
    console.log("\n=== 123 ===\n");
    console.log(JSON.stringify(doc, null, 2));
		//*/
    expect(typeof doc).toBe("object");
    done();
  });
});

test("attach to and parse Pathway from string", done => {
  expect.assertions(3);

  var parser = new cxml.Parser();
  parser.attach(
    class CustomHandler extends gpml.document.Pathway.constructor {
      _before() {
        /*
        console.log("Before:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }

      _after() {
        /*
        console.log("After:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }
    }
  );
  var result = parser.parse(
    '<Pathway name="sample pathway"><Comment>hello there</Comment></Pathway>',
    gpml.document
  );
  result.then(doc => {
    /*
    console.log("\n=== 123 ===\n");
    console.log(JSON.stringify(doc, null, 2));
		//*/
    expect(typeof doc).toBe("object");
    done();
  });
});

test("attach to and parse Pathway from stream", done => {
  expect.assertions(3);

  var parser = new cxml.Parser();
  parser.attach(
    class CustomHandler extends gpml.document.Pathway.constructor {
      _before() {
        /*
        console.log("Before:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }

      _after() {
        /*
        console.log("After:");
        console.log(JSON.stringify(this));
				//*/
        expect(typeof this).toBe("object");
      }
    }
  );
  var result = parser.parse(
    fs.createReadStream(path.resolve(__dirname, "../input/one-of-each.gpml")),
    gpml.document
  );
  result.then(doc => {
    /*
    console.log("\n=== 123 ===\n");
    console.log(JSON.stringify(doc, null, 2));
		//*/
    expect(typeof doc).toBe("object");
    done();
  });
});

//test("attach to Pathway.DataNode[0].Comment[0]", done => {
//  var parser = new cxml.Parser();
//  parser.attach(
//    class CustomHandler extends gpml.document.Pathway.DataNode[0].Comment[0]
//      .constructor {
//      /*
//      _before() {
//        console.log("Before:");
//        console.log(JSON.stringify(this));
//        expect(typeof this).toBe("object");
//      }
//			//*/
//
//      _after() {
//        console.log("After:");
//        console.log(JSON.stringify(this));
//        expect(this.content).toBe("DataNode: anotherComment");
//      }
//    }
//  );
//  var result = parser.parse(
//    fs.createReadStream(path.resolve(__dirname, "../input/one-of-each.gpml")),
//    gpml.document
//  );
//  result.then(doc => {
//    console.log("\n=== 123 ===\n");
//    console.log(JSON.stringify(doc, null, 2));
//    expect(typeof doc).toBe("object");
//    done();
//  });
//});

////***************************
//var parser1 = new cxml.Parser();
//var result1 = parser1.parse(
//  fs.createReadStream(path.resolve(__dirname, "../input/one-of-each.gpml")),
//  gpml.document
//);
//
//parser1.attach(
//  class CustomHandler extends gpml.document.Pathway.constructor {
//    _before() {
//      console.log("this _before");
//      console.log(this);
//    }
//
//    _after() {
//      console.log("this _after");
//      console.log(this);
//    }
//  }
//);
//
//result1.then(doc => {
//  console.log("\n=== 123 ===\n");
//  console.log(JSON.stringify(doc, null, 2));
//});
////***************************
//
//var parser = new cxml.Parser();
//
//var result = parser.parse(
//  fs.createReadStream(path.resolve(__dirname, "../input/one-of-each.gpml")),
//  gpml.document
//);
//
//test("attach to Pathway", done => {
//  parser.attach(
//    class CustomHandler extends gpml.document.Pathway.constructor {
//      _before() {
//        console.log("this _before");
//        console.log(this);
//      }
//
//      _after() {
//        console.log("this _after");
//        console.log(this);
//        done();
//      }
//    }
//  );
//});
//
//parser.attach(
//  class CustomHandler extends gpml.document.Pathway.Comment[0].constructor {
//    _before() {
//      //expect(typeof this).toBe("object");
//    }
//
//    _after() {
//      console.log("this");
//      console.log(this);
//      /*
//			if (iAfter < 1) {
//				expect(this.content).toBe("Document: mycommentA");
//				done();
//			}
//			iAfter += 1;
//			//*/
//    }
//  }
//);
//
////test("attach to Pathway.Comment[0]", done => {
////  let iAfter = 0;
////  expect.assertions(1);
////  parser.attach(
////    class CustomHandler extends gpml.document.Pathway.Comment[0]
////      .constructor {
////      _before() {
////        //expect(typeof this).toBe("object");
////      }
////
////      _after() {
////        console.log("this");
////        console.log(this);
////        expect(this.content).toBe("Document: mycommentA");
////        done();
////        /*
////        if (iAfter < 1) {
////          expect(this.content).toBe("Document: mycommentA");
////          done();
////        }
////        iAfter += 1;
////				//*/
////      }
////    }
////  );
////});
//
////test("attach to Pathway.DataNode[0].Comment[0]", done => {
////  let called = false;
////  parser.attach(
////    class CustomHandler extends gpml.document.Pathway.DataNode[0].Comment[0]
////      .constructor {
////      /*
////      _before() {
////        console.log("Before:");
////        console.log(JSON.stringify(this));
////        expect(typeof this).toBe("object");
////      }
////			//*/
////
////      _after() {
////        console.log("After:");
////        console.log(JSON.stringify(this));
////        if (!called) {
////          called = true;
////          expect(this.content).toBe("DataNode: anotherComment");
////          done();
////        }
////      }
////    }
////  );
////});
//
//test("full response", () => {
//  expect.assertions(1);
//  return result.then(doc => {
//    //console.log("\n=== 123 ===\n");
//    //console.log(JSON.stringify(doc, null, 2));
//    expect(typeof doc).toBe("object");
//  });
//});
//
///*
//console.log("gpml.document.Pathway.Comment[0].constructor.toString()");
//console.log(gpml.document.Pathway.Comment[0].constructor.toString());
//console.log(gpml.document.Pathway.Comment[0].constructor);
//console.log(gpml.document.Pathway.Comment[0]);
//
//console.log(
//  "gpml.document.Pathway.DataNode[0].Comment[0].constructor.toString()"
//);
//console.log(
//  gpml.document.Pathway.DataNode[0].Comment[0].constructor.toString()
//);
//console.log(gpml.document.Pathway.DataNode[0].Comment[0].constructor);
//console.log(gpml.document.Pathway.Comment[0]);
////*/
//
//// passes
//test("path awareness1", () => {
//  expect(gpml.document.Pathway.Comment).not.toBe(
//    gpml.document.Pathway.DataNode[0].Comment
//  );
//});
//
///*
//// fails
//test("path awareness2", () => {
//  expect(gpml.document.Pathway.Comment[0]).not.toBe(
//    gpml.document.Pathway.DataNode[0].Comment[0]
//  );
//});
////*/
