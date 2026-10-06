# Domain setup

**A kinitro.ai domain works best with seven sections, each with a fixed purpose, lifetime and audience.** The agent keeps them in order and archives what is outdated. This page is the recommended standard. The domain owner may adapt it.

## The sections

| Section | Holds | Lifetime | Visible to |
|---|---|---|---|
| `_Model` | Data tables and model handbooks. Only when the solution uses data. | Permanent | Design mode |
| `_Solution` | UI views, tools and scripts | Permanent | Design mode |
| `Design` | Current concepts, designs and specifications. One living document per subject, without overlaps (MECE). | Permanent. Superseded documents are archived with an expiry. | Everyone |
| `Knowledge` | Findings, methods and sources as small records with review dates | Permanent | Everyone |
| `Reports` | Dated reports for one occasion | 4 weeks | Everyone |
| `Dossiers` | Long-term reports | Permanent | Everyone |
| `_Work` | Scratch, probes, interim results, session protocols | 7 days | Design mode |

Sections starting with an underscore are technical. Business users do not see them unless Design mode is on.

The plugin writes session protocols to `_Work`, in the section `Protocols: Claude sessions`. They expire after 7 days like all scratch.

## What the domain node carries

- **`purpose`:** a short statement of what the solution is for and for whom.
- **An "Index":** a list of the sections and the key documents, with one line each.

The agent reads both before it works in the domain.

## Indexes

- Every section has an **Index**: what is in it, what is current, what is archived.
- Every key cloud folder has a file `00_INDEX.md` with the same role.
- The agent updates the Index in the same step as the change.

## Naming

**Documents in kinitro.ai:** `<Type>: <Main topic> (<Status>)`

- Deliverables add the date: `<Type>: <Main topic> (<Status>) YYYY-MM-DD`.
- Examples: `Design: Pricing model (Active)`, `Report: Quarterly review (Final) 2026-10-06`.

**Files in the cloud folder:** `<TYPE>_<Main-topic>_<Status>[_YYYY-MM-DD].<ext>`

- Example: `REPORT_Quarterly-review_Final_2026-10-06.pdf`.

**Status vocabulary:** Draft, Review, Active, Final, Superseded. Use no other values.

## Where content lives

| Content | Where |
|---|---|
| Markdown documents (reports, designs, plans, concepts) | Document nodes in the right section of the domain. Edited in place, no copies. |
| Office files, PDFs, data files | The cloud folder. Reports and designs go to their own subfolders. |
| Single-use scripts | Under the agent node. They expire after 7 days. |
| Project knowledge | `Knowledge`, as atomic records. One fact in one place. |

## Lifetimes

- Each document gets an expiry that fits its section.
- `Reports` expire after 4 weeks. Anything worth keeping long term moves to `Dossiers` first.
- `Design` documents are living. The agent keeps one per subject. When a document is replaced, the old one becomes `Superseded` and is archived with an expiry.
- Knowledge records carry a review date. The agent revisits them when the date passes.

Section-level expiry rules cannot yet be configured in kinitro.ai. Agents set the expiry per document. See [known limits](plugin-reference.md#known-limits-in-the-beta).

## Responsibilities of the agent

The agent:

1. Reads the domain purpose and Index, then the section Index, before it works in a section.
2. Names documents and files as above.
3. Keeps every Index current.
4. Edits documents in place instead of creating copies.
5. Archives what is outdated and sets expiry dates.
6. Fetches the procedure for a task type before acting.

The domain owner:

1. Sets the purpose and the first Index.
2. Decides who may see and edit what, including Design mode.
3. Links the general procedure library with the `general-procedures` edge. See the [plugin reference](plugin-reference.md#what-must-be-configured-in-kinitroai).
4. Reviews the agent's instructions from time to time.

## Checklist for a new domain

- [ ] Seven sections created, with the lifetimes above
- [ ] `purpose` written on the domain node
- [ ] Index on the domain node and in each section
- [ ] `general-procedures` edge set
- [ ] Agent node has its own instructions
- [ ] Cloud folder with `00_INDEX.md` in each key folder
- [ ] Access rights reviewed ([Security and privacy](security-and-privacy.md))
