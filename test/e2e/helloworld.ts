import unittest = require("unittest/unittest");

function main(): void {  
    test("bigifies text", function() {  
        expect("hello".toUpperCase(), equals("HELLO"));
    });
}