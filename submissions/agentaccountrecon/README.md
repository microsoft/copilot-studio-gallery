## Account Recon Agent

### Purpose

The **Account Recon Agent** supports accounts payable reconciliation by retrieving purchase order, invoice, and goods receipt records from Microsoft Dataverse and validating them through a three-way matching process. It identifies reconciliation exceptions, explains supported discrepancies, produces structured reconciliation reports, and can draft exception emails for review.

### Table of Contents
- [Capabilities](#capabilities)
- [Skills](#skills)
- [AP Data Retrieval](#1-ap-data-retrieval)
- [Three-Way Match Validation](#2-three-way-match-validation)
- [Reconciliation Error Handling](#3-reconciliation-error-handling)
- [Exception Email Drafting](#4-exception-email-drafting)
- [Reconciliation Report Output](#5-reconciliation-report-output)
- [Data Model](#data-model)
- [Response Rules](#response-rules)
- [Missing and Partial Data](#missing-and-partial-data)
- [Example Requests](#example-requests)
- [Deployment](#deployment)
- [Data Protection](#data-protection)

### Capabilities

| Area | Description |
|---|---|
| AP Data Retrieval | Retrieves purchase orders, invoices, and goods receipts from configured Dataverse tables |
| Three-Way Matching | Compares PO, invoice, and goods receipt values using available identifiers and transaction fields |
| Exception Identification | Identifies missing records and supported quantity, price, amount, or receipt discrepancies |
| Reconciliation Reporting | Produces clear reconciliation results and exception summaries |
| Communication | Drafts exception-related emails for user review before sending |

### Skills

#### 1. AP Data Retrieval

**Use for:**
- Retrieving purchase order records
- Retrieving invoice records
- Retrieving goods receipt records
- Locating records using PO number, invoice number, goods receipt number, vendor, or relevant dates

**Behavior:**
- Uses configured Dataverse data sources.
- Returns only records relevant to the user's request.
- Does not create or infer missing transaction values.

#### 2. Three-Way Match Validation

**Use for:**
- Comparing purchase order, invoice, and goods receipt records
- Validating ordered, invoiced, and received quantities
- Comparing unit prices and transaction totals when values are available
- Identifying matched and exception transactions

**Validation areas:**
- Purchase order number alignment
- Invoice and goods receipt references
- Ordered, invoiced, and received quantities
- Unit price and total amount consistency
- Vendor and currency consistency when available

**Behavior:**
- Performs comparisons only when the required source values are available.
- Clearly distinguishes matched records from exceptions.
- Does not assume that a missing value equals zero.

#### 3. Reconciliation Error Handling

**Use for:**
- Missing purchase orders, invoices, or goods receipts
- Invalid or incomplete record references
- Data retrieval failures
- Unsupported comparisons caused by missing values

**Behavior:**
- Explains the issue in clear business language.
- Identifies which record or field is unavailable.
- Recommends a practical next step without fabricating data.

#### 4. Exception Email Drafting

**Use when:** the user requests an email about a reconciliation exception.

**Workflow:**
1. Prepare an email draft using validated reconciliation findings.
2. Show the recipient, subject, and message body for review.
3. Request explicit user approval before sending.
4. Send only after approval through the configured Outlook connection.

#### 5. Reconciliation Report Output

**Use for:**
- Reconciliation summaries
- Matched and unmatched transaction reports
- Exception details
- Follow-up recommendations

**Behavior:**
- Presents transaction records and comparison results in clean tables.
- Uses concise findings and action-oriented recommendations.
- Includes source values used in each supported comparison.

### Data Model

The solution includes the following Microsoft Dataverse tables:

| Table | Key business fields |
|---|---|
| New Purchase Order | PO Number, Vendor, Item, Quantity Ordered, Unit Price, Total PO Value, PO Date, Currency |
| New Invoice | Invoice Number, PO Number, Goods Receipt Number, Vendor, Quantity Invoiced, Unit Price, Invoice Total, Invoice Date, Notes |
| New Goods Receipt | Goods Receipt Number, PO Number, Invoice Number, Received Quantity, Goods Receipt Date, Receipt Status |

### Response Rules

| Rule | Requirement |
|---|---|
| Tone | Professional, concise, and action-oriented |
| Records | Display transaction records and matching results in tables |
| Findings | Present exceptions and recommendations as bullet points |
| Accuracy | Never fabricate, estimate, or infer missing financial information |
| Comparisons | Compare values only when all required fields are available |
| Missing Values | Do not treat missing values as zero |
| Communication | Never send an exception email without explicit user approval |
| Security | Limit output to the financial information required for the request |

### Missing and Partial Data

When no matching AP data is available, return:

**Return Status:** No Data Found  
**Explanation:** State which requested records were not found.  
**Follow-up Question:** Ask for a relevant identifier such as PO number, invoice number, goods receipt number, vendor, or date range.

For partial data:
- Show the records that were successfully retrieved.
- Identify the missing document or field.
- Do not complete unsupported calculations.
- Mark the reconciliation as incomplete when a required document is unavailable.

### Example Requests

| Request | Capability Used |
|---|---|
| "Reconcile invoice INV-1001 with its purchase order and goods receipt." | AP Data Retrieval and Three-Way Match Validation |
| "Show all invoices with quantity mismatches." | Three-Way Match Validation and Reconciliation Report Output |
| "Why could this invoice not be reconciled?" | Reconciliation Error Handling |
| "Create an exception report for unmatched invoices." | Reconciliation Report Output |
| "Draft an email to the AP team about this mismatch." | Exception Email Drafting |

### Deployment

1. Download or clone the GitHub sample repository.
2. Import the **Account Recon** solution into the target Microsoft Power Platform environment.
3. Confirm that the Dataverse tables and agent components are included after import.
4. Configure the required Dataverse, Work IQ, and Outlook connections.
5. Review connection references and replace environment-specific connections where required.
6. Validate permissions for purchase order, invoice, and goods receipt data.
7. Test retrieval, three-way matching, report generation, and the email approval workflow before production use.

### Data Protection

- Use only authorized financial and procurement data.
- Do not expose purchase order, invoice, vendor, or reconciliation information beyond the user's request.
- Do not fabricate missing records or financial values.
- Do not send emails without explicit user approval.
- Follow the organization's access control, retention, and compliance policies.
