// Load Pyodide
const pyodideScript = document.createElement('script');
pyodideScript.src = 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js';
document.head.appendChild(pyodideScript);

let pyodide;
pyodideScript.onload = async function() {
  pyodide = await loadPyodide();
  await pyodide.loadPackagesFromImports(`
    import sys
    import re
  `);

  // Load the EZLang interpreter into Pyodide
  await pyodide.runPythonAsync(`
import sys
import re

# Lexer: Split code into tokens
def lex(code):
    tokens = []
    token_specs = [
        ('NUMBER', r'\\d+'),             # Integers
        ('STRING', r'"[^"]*"'),          # Strings
        ('PRINT', r'print'),             # Print keyword
        ('IF', r'if'),                   # If keyword
        ('LBRACE', r'\\{'),              # {
        ('RBRACE', r'\\}'),              # }
        ('ASSIGN', r'='),                # =
        ('OP', r'[+\\-*/]'),             # Math ops
        ('COMPARE', r'[<>]=?|=='),        # Comparisons
        ('LPAREN', r'\\('),              # (
        ('RPAREN', r'\\)'),              # )
        ('IDENTIFIER', r'[a-zA-Z_]+'),    # Variables
        ('SKIP', r'[ \\t\\n]+'),          # Skip whitespace
    ]
    token_regex = '|'.join(f'(?P<{name}>{regex})' for name, regex in token_specs)
    for match in re.finditer(token_regex, code):
        kind = match.lastgroup
        value = match.group()
        if kind == 'NUMBER':
            value = int(value)
        elif kind == 'STRING':
            value = value[1:-1]  # Remove quotes
        elif kind == 'SKIP':
            continue
        tokens.append((kind, value))
    return tokens

# Parser: Build an Abstract Syntax Tree (AST)
class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def parse(self):
        stmts = []
        while self.pos < len(self.tokens):
            stmt = self.parse_stmt()
            stmts.append(stmt)
        return stmts

    def parse_stmt(self):
        if self.peek('PRINT'):
            return self.parse_print()
        elif self.peek('IF'):
            return self.parse_if()
        elif self.peek('IDENTIFIER') and self.peek_next('ASSIGN'):
            return self.parse_assignment()
        else:
            raise SyntaxError(f"Invalid statement at token {self.tokens[self.pos]}")

    def parse_print(self):
        self.consume('PRINT')
        expr = self.parse_expr()
        return ('print', expr)

    def parse_if(self):
        self.consume('IF')
        condition = self.parse_expr()
        self.consume('LBRACE')
        body = []
        while not self.peek('RBRACE'):
            body.append(self.parse_stmt())
        self.consume('RBRACE')
        return ('if', condition, body)

    def parse_assignment(self):
        var_name = self.consume('IDENTIFIER')[1]
        self.consume('ASSIGN')
        expr = self.parse_expr()
        return ('assign', var_name, expr)

    def parse_expr(self):
        return self.parse_compare()

    def parse_compare(self):
        left = self.parse_add_sub()
        if self.peek('COMPARE'):
            op = self.consume('COMPARE')[1]
            right = self.parse_add_sub()
            return (op, left, right)
        return left

    def parse_add_sub(self):
        node = self.parse_mul_div()
        while self.peek('OP') and self.current()[1] in '+-':
            op = self.consume('OP')[1]
            node = (op, node, self.parse_mul_div())
        return node

    def parse_mul_div(self):
        node = self.parse_primary()
        while self.peek('OP') and self.current()[1] in '*/':
            op = self.consume('OP')[1]
            node = (op, node, self.parse_primary())
        return node

    def parse_primary(self):
        if self.peek('NUMBER'):
            return self.consume('NUMBER')[1]
        elif self.peek('STRING'):
            return self.consume('STRING')[1]
        elif self.peek('IDENTIFIER'):
            return ('var', self.consume('IDENTIFIER')[1])
        elif self.peek('LPAREN'):
            self.consume('LPAREN')
            node = self.parse_expr()
            self.consume('RPAREN')
            return node
        else:
            raise SyntaxError(f"Unexpected token: {self.tokens[self.pos]}")

    def peek(self, kind):
        return self.pos < len(self.tokens) and self.tokens[self.pos][0] == kind

    def peek_next(self, kind):
        return self.pos + 1 < len(self.tokens) and self.tokens[self.pos + 1][0] == kind

    def consume(self, kind):
        if self.peek(kind):
            token = self.tokens[self.pos]
            self.pos += 1
            return token
        raise SyntaxError(f"Expected {kind}, got {self.tokens[self.pos][0]}")

    def current(self):
        return self.tokens[self.pos]

# Interpreter: Execute the AST
class Interpreter:
    def __init__(self):
        self.vars = {}
        self.output = []

    def run(self, ast):
        self.output = []
        for stmt in ast:
            self.eval_stmt(stmt)
        return '\\n'.join(self.output)

    def eval_stmt(self, stmt):
        if stmt[0] == 'print':
            value = self.eval_expr(stmt[1])
            self.output.append(str(value))
        elif stmt[0] == 'if':
            condition = self.eval_expr(stmt[1])
            if condition:
                for body_stmt in stmt[2]:
                    self.eval_stmt(body_stmt)
        elif stmt[0] == 'assign':
            var_name = stmt[1]
            value = self.eval_expr(stmt[2])
            self.vars[var_name] = value

    def eval_expr(self, expr):
        if isinstance(expr, int):
            return expr
        elif isinstance(expr, str):
            return expr
        elif expr[0] == 'var':
            var_name = expr[1]
            return self.vars.get(var_name, 0)
        elif isinstance(expr, tuple):
            op, left, right = expr
            left_val = self.eval_expr(left)
            right_val = self.eval_expr(right)
            if op == '+':
                return left_val + right_val
            elif op == '-':
                return left_val - right_val
            elif op == '*':
                return left_val * right_val
            elif op == '/':
                return left_val // right_val
            elif op == '>':
                return left_val > right_val
            elif op == '<':
                return left_val < right_val
            elif op == '==':
                return left_val == right_val
            elif op == '>=':
                return left_val >= right_val
            elif op == '<=':
                return left_val <= right_val
        else:
            raise ValueError(f"Unknown expression: {expr}")

def run_ezlang(code):
    try:
        tokens = lex(code)
        parser = Parser(tokens)
        ast = parser.parse()
        interpreter = Interpreter()
        return interpreter.run(ast)
    except Exception as e:
        return f"Error: {str(e)}"
  `);
  
  console.log("EZLang interpreter loaded successfully!");
};

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
  const editor = document.getElementById('editor');
  const output = document.getElementById('output');
  const runBtn = document.getElementById('run-btn');
  const exampleBtns = document.querySelectorAll('.example-btn');

  // Example code snippets
  const examples = {
    hello: 'print "Hello, World!"',
    variables: 'x = 10\nprint x\nx = x + 5\nprint x',
    if: 'x = 10\nif x > 5 {\n  print "x is greater than 5"\n}',
    math: 'a = 10\nb = 5\nprint a + b\nprint a - b\nprint a * b\nprint a / b'
  };

  // Load an example into the editor
  function loadExample(name) {
    editor.value = examples[name];
  }

  // Run the code using Pyodide
  async function runCode() {
    if (!pyodide) {
      output.innerHTML =
        "<span class='error'>Interpreter is still loading. Please wait...</span>";
      return;
    }

    const code = editor.value;
    if (!code.trim()) {
      output.textContent = "Please enter some code first.";
      return;
    }

    try {
      const result = await pyodide.runPythonAsync(
        `run_ezlang(${JSON.stringify(code)})`
      );
      output.textContent = result;
    } catch (err) {
      output.innerHTML = `<span class='error'>Error: ${err.message}</span>`;
    }
  }

  // Event listeners
  runBtn.addEventListener('click', runCode);

  exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      loadExample(btn.dataset.example);
    });
  });

  // Allow running code with Ctrl+Enter in the editor
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      runCode();
      e.preventDefault();
    }
  });
});
