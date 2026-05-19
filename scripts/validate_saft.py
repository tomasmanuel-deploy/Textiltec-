#!/usr/bin/env python3
import sys
from lxml import etree

"""
Usage:
  python3 scripts/validate_saft.py <xsd_path>
Reads SAF-T XML from stdin and validates against the XSD.
Exit code 0 if valid, 1 otherwise. Prints diagnostic messages to stdout.
"""

def main():
    if len(sys.argv) < 2:
        print("Missing XSD path argument", file=sys.stderr)
        sys.exit(2)
    xsd_path = sys.argv[1]

    try:
        with open(xsd_path, 'rb') as f:
            schema_doc = etree.parse(f)
        schema = etree.XMLSchema(schema_doc)
    except Exception as e:
        print(f"Failed to load XSD: {e}", file=sys.stderr)
        sys.exit(2)

    xml_data = sys.stdin.buffer.read()
    if not xml_data:
        print("No XML input provided on stdin", file=sys.stderr)
        sys.exit(2)

    try:
        xml_doc = etree.fromstring(xml_data)
    except Exception as e:
        print(f"XML parse error: {e}")
        sys.exit(1)

    is_valid = schema.validate(xml_doc)
    if is_valid:
        print("OK")
        sys.exit(0)
    else:
        # Print detailed errors
        errors = schema.error_log
        if errors is not None:
            for err in errors:
                print(f"Line {err.line}: {err.message}")
        else:
            print("Validation failed without specific error messages")
        sys.exit(1)

if __name__ == '__main__':
    main()