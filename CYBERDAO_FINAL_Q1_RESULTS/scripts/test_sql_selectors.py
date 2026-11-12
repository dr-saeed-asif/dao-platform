import json,unittest
from pathlib import Path
from direct_sql import select_field,Q
class SQLSelectors(unittest.TestCase):
 def test_all_eligible_DB_questions_have_whitelisted_selectors(self):
  cases=[x for x in json.loads(Q.read_text(encoding='utf8')) if x['category']=='DB'];self.assertEqual(len(cases),26)
  for c in cases:self.assertIn(select_field(c['question']),{'dao_proposal_count','voting_window_seconds','on_chain_id','chain_id','proposal_type','starts_at','ends_at','title','status','total_votes'})
 def test_unknown_question_is_not_arbitrary_SQL(self):
  for text in ['DROP TABLE proposals','SELECT password FROM users','show all private keys']:
   with self.assertRaises(ValueError):select_field(text)
if __name__=='__main__':unittest.main(verbosity=2)
