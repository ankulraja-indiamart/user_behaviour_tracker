import dotenv from 'dotenv'
import { transformCslLogs } from '../utils/cslTransformer.js'

dotenv.config()

// Example: raw CSL logs from backend API should be passed into the transformer
const rawLogs = [
  {
    glusr_id: '141178688',
    datevalue: '20260323102013',
    fk_activity_id: 677,
    request_url: '/search?q=keyboard&cq=Mumbai',
    fk_display_title: 'IndiaMART Search',
  },
  {
    glusr_id: '141178688',
    datevalue: '20260323102055',
    fk_activity_id: 438,
    request_url: '/proddetail/lenovo-keyboard-123456.html',
    product_disp_id: '123456',
    s_prod_name: 'Lenovo Keyboard',
    fk_display_title: 'Product View',
  },
  {
    glusr_id: '141178688',
    datevalue: '20260323102555',
    fk_activity_id: 4243,
    request_url: '/enquiry?ctaType=Product%20Enquiry',
    fk_display_title: 'Product Enquiry',
    enquiry_cta_name: 'Get Best Price',
  },
]

const structured = transformCslLogs(rawLogs)
console.log(JSON.stringify(structured, null, 2))
