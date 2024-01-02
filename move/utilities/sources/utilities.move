module apto_orm::utilities {
    use std::string::{Self, String};

    public fun join_str1(_de: &String, s1: &String): String {
        *s1
    }

    public fun join_str2(de: &String, s1: &String, s2: &String): String {
        let s: String = string::utf8(b"");
        string::append(&mut s, *s1);
        string::append(&mut s, *de);
        string::append(&mut s, *s2);
        s
    }

    public fun join_str3(de: &String, s1: &String, s2: &String, s3: &String): String {
        let s: String = string::utf8(b"");
        string::append(&mut s, *s1);
        string::append(&mut s, *de);
        string::append(&mut s, *s2);
        string::append(&mut s, *de);
        string::append(&mut s, *s3);
        s
    }
}