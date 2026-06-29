export interface AppUser {
  name: string
  email: string
  title: string
  authority_level: number
  department: string
}

export const USERS: AppUser[] = [
  { name: 'Antony Awaida',    email: 'antony@apporto.com',       title: 'CEO',                             authority_level: 4, department: 'Executive'   },
  { name: 'Veton Krasniqi',   email: 'v.krasniqi@apporto.com',   title: 'AI Product Owner',                authority_level: 3, department: 'Product'     },
  { name: 'Michael Smith',    email: 'msmith@apporto.com',        title: 'Director of Marketing',           authority_level: 4, department: 'Marketing'   },
  { name: 'Brian Gray',       email: 'brian@apporto.com',         title: 'Chief Engineering Officer',       authority_level: 4, department: 'Engineering' },
  { name: 'Phil Spitze',      email: 'p.spitze@apporto.com',      title: 'VP Sales / Solutions Architect',  authority_level: 3, department: 'Sales'       },
  { name: 'Austin Shelp',     email: 'a.shelp@apporto.com',       title: 'Account Executive',               authority_level: 2, department: 'Sales'       },
  { name: 'Dallin Hutchison', email: 'd.hutchison@apporto.com',   title: 'Lead Engineer / Release Manager', authority_level: 3, department: 'Engineering' },
  { name: 'Tony Dunckel',     email: 't.dunckel@apporto.com',     title: 'Product Owner, VDI / DaaS',       authority_level: 3, department: 'Product'     },
  { name: 'Suleman Ashfaq',   email: 's.ashfaq@apporto.com',      title: 'AI Engineer',                     authority_level: 3, department: 'Engineering' },
  { name: 'Tusha Pavuluri',   email: 't.pavuluri@apporto.com',    title: 'Lead QA Engineer',                authority_level: 3, department: 'QA'          },
]

export const USER_BY_EMAIL = new Map(USERS.map((u) => [u.email, u]))
