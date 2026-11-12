import unittest
from decimal import Decimal
import analyze
class AnalysisChecks(unittest.TestCase):
 def test_wilson_empty(self):self.assertIsNone(analyze.wilson(0,0))
 def test_wilson_boundary(self):
  low,high=analyze.wilson(0,16);self.assertAlmostEqual(low,0);self.assertGreater(high,0.19);self.assertLess(high,0.20)
 def test_numeric_grouping(self):self.assertEqual(analyze.nums('EUR 6,000 and 9.5'),[Decimal(6000),Decimal('9.5')])
 def test_uuid_never_counts(self):self.assertFalse(analyze.proxy('38a3c43c-1e3b-47c9-8688-20e6e64ec495',{'expected_answer':'1','expected_behavior':'facts'}))
 def test_reference_markers_never_count(self):self.assertFalse(analyze.proxy('Source [D1]',{'expected_answer':'1','expected_behavior':'facts'}))
 def test_repeated_values_are_not_one(self):self.assertFalse(analyze.proxy('10 members',{'expected_answer':'database 10; chain 10','expected_behavior':'facts'}))
 def test_actual_bounded_abstention_enum(self):self.assertTrue(analyze.proxy('[no evidence found]',{'expected_answer':'Document does not establish the requested fact','expected_behavior':'bounded_abstention_or_reject_false_premise'}))
 def test_documented_proxy_limitation(self):self.assertTrue(analyze.proxy('Travel EUR 6000',{'expected_answer':'Equipment EUR 6000','expected_behavior':'facts'}))
 def test_paired_cluster_interval(self):self.assertEqual(analyze.cluster_ci([{'scope_label':'a','value':1},{'scope_label':'b','value':1}],'value'),[1,1])
if __name__=='__main__':unittest.main(verbosity=2)

