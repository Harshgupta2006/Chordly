import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("check_secrets", Path(__file__).resolve().parents[1] / "check_secrets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SecretChecks(unittest.TestCase):
    def test_recognizes_credentials_without_returning_values(self):
        for value in ["gh" + "p_" + "a" * 36, "hf" + "_" + "b" * 34,
                      "AK" + "IA" + "A" * 16, "-----BEGIN " + "PRIVATE KEY-----",
                      'API_KEY="' + "abc123" * 6 + '"']:
            result = module.findings(value.encode())
            self.assertTrue(result)
            self.assertNotIn(value, repr(result))

    def test_placeholders_and_binary_are_not_credentials(self):
        for value in [b'API_KEY="your_api_key_here"', b'DATABASE_URL=postgresql://reader:local_dev_password@localhost/chordly', b"\0binary"]:
            self.assertEqual(module.findings(value), [])


if __name__ == "__main__":
    unittest.main()
