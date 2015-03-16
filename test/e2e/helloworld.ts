import t = require("unittest/unittest");

function main(): void {  
    t.test("bigifies text", function() {
        t.expect("hello".toUpperCase(), t.equals("HELLO"));
    });
}