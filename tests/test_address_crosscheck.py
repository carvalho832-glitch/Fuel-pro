import unittest
from address_crosscheck import street_parts, compare_cadastral_addresses

POST="12345678000190"
OTHER="22222222000199"

def high(cnpj):
    return {"cnpj":cnpj,"city":"ARARAQUARA","name":"POSTO TESTE","priority":"high"}

class AddressCrosscheckTests(unittest.TestCase):
    def test_same_address_not_automatically_a_verified_pin(self):
        prices=[{"cnpj":POST,"city":"ARARAQUARA",
                 "address":"AVENIDA DOM PEDRO II, 150, CENTRO, ARARAQUARA - SP"}]
        register={POST:{"city":"ARARAQUARA","address":"AV DOM PEDRO II, 150"}}
        rows,summary=compare_cadastral_addresses(prices,register,[high(POST)])
        self.assertEqual(summary["compared"],1)
        self.assertEqual(summary["textuallyConsistent"],1)
        self.assertEqual(summary["approvedLocations"],0)
        self.assertFalse(rows[0]["manualReviewApproved"])
        self.assertEqual(rows[0]["status"],"textually_consistent_unverified_location")

    def test_number_mismatch_flags_review(self):
        prices=[{"cnpj":POST,"city":"ARARAQUARA","address":"RUA BRASIL, 100, CENTRO"}]
        register={POST:{"city":"ARARAQUARA","address":"RUA BRASIL, 200"}}
        rows,summary=compare_cadastral_addresses(prices,register,[high(POST)])
        self.assertEqual(summary["addressDiscrepancies"],1)
        self.assertEqual(rows[0]["houseNumberEqual"],False)

    def test_missing_price_only_marks_uncomparable(self):
        rows,summary=compare_cadastral_addresses([],{
            POST:{"city":"ARARAQUARA","address":"RUA TESTE, 100"}
        },[high(POST)])
        self.assertEqual(summary["withoutComparableAddress"],1)
        self.assertIsNone(rows[0]["priceSampleAddress"])

    def test_non_high_priority_is_not_in_priority_audit(self):
        normal=high(POST)
        normal["priority"]="normal"
        rows,summary=compare_cadastral_addresses([],{},[normal])
        self.assertEqual(rows,[])
        self.assertEqual(summary["highPriorityCount"],0)

if __name__=="__main__":
    unittest.main()
