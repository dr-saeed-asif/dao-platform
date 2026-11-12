"""Unit checks of review statistics; these fixtures are not human judgments."""
import unittest
from assess_reviews import agreement


class AgreementChecks(unittest.TestCase):
    def test_no_reviews_is_not_zero_agreement(self):
        with self.assertRaises(ValueError):
            agreement([], [])

    def test_perfect_nonconstant_agreement(self):
        result = agreement(["valid", "invalid"], ["valid", "invalid"])
        self.assertEqual(result["percent_agreement"], 1)
        self.assertEqual(result["cohens_kappa"], 1)

    def test_constant_ratings_have_undefined_kappa(self):
        result = agreement(["valid", "valid"], ["valid", "valid"])
        self.assertEqual(result["percent_agreement"], 1)
        self.assertIsNone(result["cohens_kappa"])

    def test_opposed_binary_ratings(self):
        self.assertEqual(agreement(["a", "b"], ["b", "a"])["cohens_kappa"], -1)


if __name__ == "__main__":
    unittest.main()
