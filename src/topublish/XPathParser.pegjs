start
        = (axis namespace? name? predicate? attribute?)+

axis
        = '//' / '/'

namespace
        = str:[a-z_]i str2:[a-z0-9_\-\.]i* ':' { return str + str2.join(""); }

name
        = str:[a-z_]i str2:[a-z0-9_\-\.]i* { return str + str2.join(""); }
          /
          '*'

predicate
        = '[' expr ']'

expr
        = attribute_ref op (string_literal / number)

attribute_ref
        = '@' name

op
        =  '=' / '!=' / '&lt;' / '&lt;=' / '&gt;' / '>' / '&gt;=' / '>='

string_literal
        = '"' str:[^"]i+ '"' { return str.join(""); } /
          "'" str:[^']i+ "'" { return str.join(""); }

number = float / integer

float "float"
    = left:[0-9]+ "." right:[0-9]+ { return parseFloat(left.join("") + "." +   right.join("")); }

integer "integer"
     = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

attribute
        = '@' str:[a-zA-Z0-9\*]+ { return str.join(""); }
