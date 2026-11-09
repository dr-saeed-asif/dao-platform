SELECT p.id, p.dao_id, p.title, p.status, p.total_votes,
       (SELECT count(*) FROM public.votes v WHERE v.proposal_id=p.id) AS indexed_votes,
       (SELECT count(*) FROM public.proposal_assignments a WHERE a.proposal_id=p.id AND a.assigned) AS assigned,
       (SELECT count(*) FROM public.proposals d WHERE d.dao_id=p.dao_id) AS dao_proposals
FROM public.proposals p
WHERE p.id IN ('e3b14215-bd47-420a-ae5a-a50d15cf0255',
               '38a3c43c-1e3b-47c9-8688-20e6e64ec495',
               '16dadecc-94cc-4fae-8089-921765854976', 'onchain-28')
ORDER BY p.id;
