using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  401k Calculator MCP server                                                 ║
// ║                                                                              ║
// ║  Runs entirely inside this custom connector's code: no hosting, no outbound  ║
// ║  calls, and no stored data. Every HTTP POST carries one JSON-RPC message and ║
// ║  receives one JSON-RPC reply, so the server is stateless.                    ║
// ║                                                                              ║
// ║  Tools (all read-only and deterministic):                                    ║
// ║    calculate_max_loan         IRS 401(k) loan limit for a new loan           ║
// ║    calculate_loan_payment     Level amortization per paycheck                ║
// ║    estimate_withdrawal_taxes  Withholding, gross-up, and tax to set aside    ║
// ║                                                                              ║
// ║  Amounts are US dollars. Rates are percentages (8.5 means 8.5%). Results are ║
// ║  estimates for education, not tax advice.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

public class Script : ScriptBase
{
    private const string ServerName = "401k-calculator";
    private const string ServerVersion = "1.0.0";
    private const string DefaultProtocolVersion = "2025-11-25";
    private static readonly string[] SupportedProtocolVersions = { "2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25" };

    private const double IrsLoanDollarCap = 50000;
    private const double IrsLoanAlternativeMinimum = 10000;
    private const double MaxGeneralPurposeYears = 5;

    private static readonly string[] ToolNames =
    {
        "calculate_max_loan",
        "calculate_loan_payment",
        "estimate_withdrawal_taxes"
    };

    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        string body = await this.Context.Request.Content.ReadAsStringAsync().ConfigureAwait(false);
        JObject reply = Handle(body);
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(reply.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json")
        };
    }

    // ── JSON-RPC dispatch ────────────────────────────────────────────────────

    private JObject Handle(string body)
    {
        JObject request;
        try
        {
            request = JObject.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        }
        catch (JsonException)
        {
            return Error(null, -32700, "Parse error: the request body is not valid JSON.");
        }

        JToken id = request["id"];
        string method = request["method"] == null ? string.Empty : request["method"].ToString();

        try
        {
            // Copilot Studio expects a valid JSON-RPC reply even for notifications, so every
            // notification (a message without an id) is acknowledged with an empty result.
            if (id == null || id.Type == JTokenType.Null || method == "initialized" || method.StartsWith("notifications/", StringComparison.Ordinal))
                return Success(id, new JObject());

            switch (method)
            {
                case "initialize":
                    return Success(id, Initialize(request));

                case "ping":
                    return Success(id, new JObject());

                case "tools/list":
                    return Success(id, new JObject { ["tools"] = ToolDefinitions() });

                case "tools/call":
                    JObject parameters = request["params"] as JObject ?? new JObject();
                    string toolName = parameters["name"] == null ? string.Empty : parameters["name"].ToString();
                    if (Array.IndexOf(ToolNames, toolName) < 0)
                        return Error(id, -32602, "Unknown tool: " + toolName);
                    return Success(id, CallTool(toolName, parameters["arguments"] as JObject ?? new JObject()));

                default:
                    return Error(id, -32601, "Method not found: " + method);
            }
        }
        catch (Exception)
        {
            return Error(id, -32603, "Internal error while handling " + method + ".");
        }
    }

    private static JObject Initialize(JObject request)
    {
        JObject parameters = request["params"] as JObject;
        string requested = parameters == null || parameters["protocolVersion"] == null
            ? string.Empty
            : parameters["protocolVersion"].ToString();
        return new JObject
        {
            // Use the client's version when this server supports it; otherwise offer the latest.
            ["protocolVersion"] = Array.IndexOf(SupportedProtocolVersions, requested) >= 0 ? requested : DefaultProtocolVersion,
            ["capabilities"] = new JObject { ["tools"] = new JObject { ["listChanged"] = false } },
            ["serverInfo"] = new JObject
            {
                ["name"] = ServerName,
                ["version"] = ServerVersion,
                ["title"] = "401k Calculator"
            },
            ["instructions"] =
                "Deterministic US 401(k) calculators. Pass dollar amounts as plain numbers and rates as " +
                "percentages (8.5 means 8.5%). Use calculate_max_loan before sizing a loan, " +
                "calculate_loan_payment for the payment per paycheck, and estimate_withdrawal_taxes for " +
                "withholding and net cash. Results are estimates for education, not tax advice. " +
                "When a tool returns isError, explain the message to the user and ask for corrected inputs."
        };
    }

    private static JObject CallTool(string name, JObject args)
    {
        try
        {
            JObject result;
            switch (name)
            {
                case "calculate_max_loan":
                    result = CalculateMaxLoan(args);
                    break;
                case "calculate_loan_payment":
                    result = CalculateLoanPayment(args);
                    break;
                default:
                    result = EstimateWithdrawalTaxes(args);
                    break;
            }
            return new JObject
            {
                ["content"] = new JArray(new JObject { ["type"] = "text", ["text"] = result.ToString(Newtonsoft.Json.Formatting.None) }),
                ["structuredContent"] = result,
                ["isError"] = false
            };
        }
        catch (InputException ex)
        {
            // A tool error is a normal result the model can read and recover from.
            return ToolError(ex.Message);
        }
        catch (Exception)
        {
            return ToolError("The calculator could not process these inputs. Check that every value is a plain number, then try again.");
        }
    }

    private static JObject ToolError(string message)
    {
        return new JObject
        {
            ["content"] = new JArray(new JObject { ["type"] = "text", ["text"] = message }),
            ["isError"] = true
        };
    }

    // ── Tool: calculate_max_loan ─────────────────────────────────────────────

    private static JObject CalculateMaxLoan(JObject args)
    {
        double vested = Number(args, "vested_balance", null, 0, 100000000);
        double current = Number(args, "current_loan_balance", 0, 0, 100000000);
        double highest = Number(args, "highest_loan_balance_last_12_months", null, 0, 100000000);
        bool allowAlternative = Flag(args, "allow_10000_exception", false);
        double planMinimum = Number(args, "plan_minimum_loan", 0, 0, 1000000);

        if (highest < current)
            throw new InputException(
                "highest_loan_balance_last_12_months cannot be less than current_loan_balance, because " +
                "today's balance is part of the last 12 months.");

        bool countLimitReached = false;
        if (Has(args, "outstanding_loan_count") != Has(args, "plan_max_loans"))
            throw new InputException("Provide both outstanding_loan_count and plan_max_loans to check the loan count, or neither.");
        if (Has(args, "outstanding_loan_count"))
        {
            double count = WholeNumber(args, "outstanding_loan_count", 0, 100);
            double maxLoans = WholeNumber(args, "plan_max_loans", 1, 100);
            countLimitReached = count >= maxLoans;
        }

        double limitA = IrsLoanDollarCap - highest;
        double vestedCap = 0.5 * vested;
        if (allowAlternative) vestedCap = Math.Min(Math.Max(vestedCap, IrsLoanAlternativeMinimum), vested);
        double limitB = vestedCap - current;
        double maxNewLoan = FloorCents(Math.Max(0, Math.Min(limitA, limitB)));

        bool eligible = !countLimitReached && maxNewLoan > 0 && maxNewLoan >= planMinimum;
        string reason;
        if (countLimitReached) reason = "The plan's maximum number of outstanding loans has been reached.";
        else if (maxNewLoan <= 0) reason = "With these balances, the IRS limit leaves no room for a new loan.";
        else if (maxNewLoan < planMinimum) reason = "The maximum new loan is below the plan's minimum loan amount.";
        else reason = "A new loan up to max_new_loan is within IRS limits. The plan's own rules still apply.";

        return new JObject
        {
            ["limit_a_dollar_cap"] = Cents(limitA),
            ["limit_b_vested_cap"] = Cents(limitB),
            ["max_new_loan"] = maxNewLoan,
            ["eligible"] = eligible,
            ["reason"] = reason,
            ["steps"] = new JArray(
                "A = $50,000 - highest balance in last 12 months = " + Money(IrsLoanDollarCap) + " - " + Money(highest) + " = " + Money(limitA),
                "B = " + (allowAlternative ? "greater of 50% of vested balance or $10,000 (capped at vested balance)" : "50% of vested balance") +
                    " - current balance = " + Money(vestedCap) + " - " + Money(current) + " = " + Money(limitB),
                "Maximum new loan = lesser of A and B, not below $0 = " + Money(maxNewLoan)),
            ["disclaimer"] = "Estimate based only on the figures provided. The recordkeeper confirms the actual limit."
        };
    }

    // ── Tool: calculate_loan_payment ─────────────────────────────────────────

    private static JObject CalculateLoanPayment(JObject args)
    {
        double rate = Number(args, "annual_rate_percent", null, 0, 30);
        double years = Number(args, "years", null, 0.25, 30);
        double periodsPerYear = Has(args, "payments_per_year") ? WholeNumber(args, "payments_per_year", 12, 52) : 26;
        double fee = Number(args, "origination_fee", 0, 0, 10000);
        bool residence = Flag(args, "principal_residence", false);

        if (periodsPerYear != 12 && periodsPerYear != 24 && periodsPerYear != 26 && periodsPerYear != 52)
            throw new InputException("payments_per_year must be 12 (monthly), 24 (semimonthly), 26 (biweekly), or 52 (weekly).");
        if (years > MaxGeneralPurposeYears && !residence)
            throw new InputException(
                "General-purpose 401(k) loans must be repaid within 5 years. Set principal_residence to true " +
                "only for a loan used to buy the borrower's main home, and check the plan's maximum term.");

        bool hasPrincipal = Has(args, "principal");
        bool hasNet = Has(args, "net_amount_needed");
        if (hasPrincipal == hasNet)
            throw new InputException("Provide either principal or net_amount_needed, but not both.");

        double principal = hasPrincipal
            ? Number(args, "principal", null, 1, 10000000)
            : Number(args, "net_amount_needed", null, 1, 10000000) + fee;
        principal = RoundCents(principal);
        if (principal <= fee)
            throw new InputException("The loan amount must be larger than the origination fee.");

        int n = (int)Math.Round(years * periodsPerYear, MidpointRounding.AwayFromZero);
        if (n < 1) throw new InputException("The term is too short for at least one payment.");
        double r = rate / 100.0 / periodsPerYear;
        double payment = r == 0 ? principal / n : principal * r / (1 - Math.Pow(1 + r, -n));
        double paymentRounded = RoundCents(payment);
        double totalPaid = RoundCents(paymentRounded * n);

        return new JObject
        {
            ["principal"] = principal,
            ["origination_fee"] = RoundCents(fee),
            ["cash_received"] = RoundCents(principal - fee),
            ["annual_rate_percent"] = rate,
            ["payments_per_year"] = (int)periodsPerYear,
            ["number_of_payments"] = n,
            ["payment_per_period"] = paymentRounded,
            ["total_of_payments"] = totalPaid,
            ["total_interest"] = RoundCents(totalPaid - principal),
            ["steps"] = new JArray(
                "r = " + Plain(rate) + "% / " + Plain(periodsPerYear) + " = " + Plain(Math.Round(r, 8)),
                "n = " + Plain(years) + " years x " + Plain(periodsPerYear) + " = " + Plain(n),
                "Payment = P x r / (1 - (1 + r)^-n) = " + Money(paymentRounded)),
            ["disclaimer"] = "Interest is paid back into the borrower's own account. The final payment may differ by a few cents."
        };
    }

    // ── Tool: estimate_withdrawal_taxes ──────────────────────────────────────

    private static JObject EstimateWithdrawalTaxes(JObject args)
    {
        double federalRate = Number(args, "federal_marginal_rate_percent", null, 0, 50) / 100.0;
        double stateRate = Number(args, "state_rate_percent", 0, 0, 20) / 100.0;
        bool additionalTax = Flag(args, "additional_tax_applies", null);
        string type = Text(args, "withdrawal_type", null);
        double fee = Number(args, "withdrawal_fee", 0, 0, 10000);
        double taxableShare = Number(args, "taxable_percent", 100, 0, 100) / 100.0;
        double stateWithholdingRate = Number(args, "state_withholding_percent", 0, 0, 20) / 100.0;

        double defaultWithholding;
        switch (type)
        {
            case "rollover_eligible": defaultWithholding = 0.20; break;
            case "hardship": defaultWithholding = 0.10; break;
            case "secure_2_0": defaultWithholding = 0.10; break;
            default:
                throw new InputException("withdrawal_type is required: rollover_eligible, hardship, or secure_2_0.");
        }
        if (type == "secure_2_0" && additionalTax)
            throw new InputException(
                "SECURE 2.0 emergency, domestic abuse, birth or adoption, and disaster distributions are exempt from " +
                "the 10% additional tax. Set additional_tax_applies to false.");
        double federalWithholdingRate = Number(args, "federal_withholding_percent", defaultWithholding * 100, 0, 100) / 100.0;
        if (type == "rollover_eligible" && federalWithholdingRate < 0.20)
            throw new InputException("A withdrawal eligible for rollover that is paid to the participant has mandatory 20% federal withholding. Use 20 or more.");

        double combinedRate = federalRate + stateRate + (additionalTax ? 0.10 : 0);
        double effectiveRate = taxableShare * combinedRate;

        bool hasNet = Has(args, "net_amount_needed");
        bool hasGross = Has(args, "gross_amount");
        if (hasNet == hasGross)
            throw new InputException("Provide either net_amount_needed or gross_amount, but not both.");

        double gross;
        if (hasNet)
        {
            if (effectiveRate >= 1) throw new InputException("The combined tax rate must be below 100%.");
            double net = Number(args, "net_amount_needed", null, 1, 10000000);
            gross = RoundCents((net + fee) / (1 - effectiveRate));
        }
        else
        {
            gross = RoundCents(Number(args, "gross_amount", null, 1, 10000000));
        }
        if (gross <= fee) throw new InputException("The withdrawal must be larger than the withdrawal fee.");

        double taxable = RoundCents(gross * taxableShare);
        double federalWithholding = RoundCents(taxable * federalWithholdingRate);
        double stateWithholding = RoundCents(taxable * stateWithholdingRate);
        double cashReceived = RoundCents(gross - federalWithholding - stateWithholding - fee);
        double totalTax = RoundCents(taxable * combinedRate);
        double setAside = RoundCents(totalTax - federalWithholding - stateWithholding);

        JObject result = new JObject
        {
            ["gross_withdrawal"] = gross,
            ["withdrawal_fee"] = RoundCents(fee),
            ["taxable_amount"] = taxable,
            ["combined_tax_rate_percent"] = Math.Round(combinedRate * 100, 2),
            ["federal_withholding"] = federalWithholding,
            ["state_withholding"] = stateWithholding,
            ["cash_received"] = cashReceived,
            ["total_expected_tax"] = totalTax,
            ["set_aside_for_tax_filing"] = setAside,
            ["net_after_all_taxes"] = RoundCents(cashReceived - setAside)
        };

        if (Has(args, "years_to_retirement"))
        {
            double years = Number(args, "years_to_retirement", null, 0, 60);
            double growth = Number(args, "assumed_annual_return_percent", 6, 0, 15) / 100.0;
            result["illustrative_pretax_value_at_retirement"] = RoundCents(gross * Math.Pow(1 + growth, years));
        }

        result["steps"] = new JArray(
            "Combined rate = federal " + Plain(Math.Round(federalRate * 100, 2)) + "% + state " + Plain(Math.Round(stateRate * 100, 2)) +
                "% + additional tax " + (additionalTax ? "10" : "0") + "% = " + Plain(Math.Round(combinedRate * 100, 2)) + "%",
            hasNet
                ? "Gross = (net + fee) / (1 - taxable share x combined rate) = " + Money(gross)
                : "Gross amount provided = " + Money(gross),
            "Set aside = total expected tax - withholding = " + Money(totalTax) + " - " + Money(federalWithholding + stateWithholding) + " = " + Money(setAside));
        result["disclaimer"] = "Estimate only. Actual tax depends on total income for the year. A negative set-aside means a likely refund.";
        return result;
    }

    // ── Tool definitions ─────────────────────────────────────────────────────

    private static JArray ToolDefinitions()
    {
        return new JArray(
            Tool("calculate_max_loan", "Calculate maximum 401(k) loan",
                "Calculates the largest new 401(k) loan allowed under IRS limits: the lesser of $50,000 minus the highest loan balance in the last 12 months, or 50% of the vested balance minus current loan balances. Optionally checks the plan's loan count and minimum.",
                Schema(
                    Bounded(Prop("vested_balance", "number", "Vested account balance in dollars.", true), 0, 100000000),
                    Bounded(Prop("highest_loan_balance_last_12_months", "number", "Highest combined loan balance at any point in the last 12 months, including today. Use 0 if there were no loans.", true), 0, 100000000),
                    Bounded(Prop("current_loan_balance", "number", "Combined balance of all loans outstanding today, including defaulted loans not yet repaid. Default 0.", false), 0, 100000000),
                    Prop("allow_10000_exception", "boolean", "True only if the plan offers the $10,000 alternative minimum, which needs extra collateral because DOL rules limit the account as security to 50% of the vested balance. Default false.", false),
                    Bounded(Prop("plan_minimum_loan", "number", "Plan's minimum loan amount. Default 0.", false), 0, 1000000),
                    Bounded(Prop("outstanding_loan_count", "integer", "Number of loans outstanding today. Provide together with plan_max_loans.", false), 0, 100),
                    Bounded(Prop("plan_max_loans", "integer", "Plan's maximum number of loans outstanding at once. Provide together with outstanding_loan_count.", false), 1, 100)),
                Output(
                    Prop("limit_a_dollar_cap", "number", "Dollar cap after the 12-month lookback.", true),
                    Prop("limit_b_vested_cap", "number", "Vested-balance cap after current loans.", true),
                    Prop("max_new_loan", "number", "Largest new loan allowed.", true),
                    Prop("eligible", "boolean", "Whether a new loan is possible.", true),
                    Prop("reason", "string", "Plain-language explanation.", true))),

            Tool("calculate_loan_payment", "Calculate 401(k) loan payment",
                "Calculates the level payment per paycheck, number of payments, and total interest for a 401(k) loan. Provide principal, or net_amount_needed to add the origination fee automatically.",
                Schema(
                    Bounded(Prop("annual_rate_percent", "number", "Annual interest rate as a percentage, for example 8.5.", true), 0, 30),
                    Bounded(Prop("years", "number", "Repayment term in years. Up to 5 unless principal_residence is true.", true), 0.25, 30),
                    Bounded(Prop("principal", "number", "Loan amount in dollars. Use this or net_amount_needed.", false), 1, 10000000),
                    Bounded(Prop("net_amount_needed", "number", "Cash the borrower needs in hand. The fee is added to get the loan amount.", false), 1, 10000000),
                    Bounded(Prop("origination_fee", "number", "Fee deducted from loan proceeds. Default 0.", false), 0, 10000),
                    OneOf(Prop("payments_per_year", "integer", "12 (monthly), 24 (semimonthly), 26 (biweekly), or 52 (weekly). Default 26.", false), new JArray(12, 24, 26, 52)),
                    Prop("principal_residence", "boolean", "True only for a loan to buy the borrower's main home. Default false.", false)),
                Output(
                    Prop("principal", "number", "Loan amount.", true),
                    Prop("cash_received", "number", "Loan amount minus the origination fee.", true),
                    Prop("number_of_payments", "integer", "Total number of payments.", true),
                    Prop("payment_per_period", "number", "Payment per paycheck, rounded to cents.", true),
                    Prop("total_interest", "number", "Total interest paid back into the account.", true))),

            Tool("estimate_withdrawal_taxes", "Estimate 401(k) withdrawal taxes",
                "Estimates the gross withdrawal needed for a net amount (or the result of a gross amount), federal and state withholding, cash received, total expected tax, and the amount to set aside for tax filing.",
                Schema(
                    Bounded(Prop("federal_marginal_rate_percent", "number", "Federal marginal income tax bracket, for example 22.", true), 0, 50),
                    Prop("additional_tax_applies", "boolean", "True if the 10% additional tax on early distributions applies (under 59½ with no exception). Must be false for secure_2_0.", true),
                    OneOf(Prop("withdrawal_type", "string", "rollover_eligible: age 59½ in-service or after leaving, paid to the participant (20% mandatory withholding). hardship: hardship withdrawal (10% default). secure_2_0: emergency, domestic abuse, birth or adoption, or disaster distribution (10% default).", true), new JArray("rollover_eligible", "hardship", "secure_2_0")),
                    Bounded(Prop("net_amount_needed", "number", "Cash needed after all taxes and fees. Use this or gross_amount.", false), 1, 10000000),
                    Bounded(Prop("gross_amount", "number", "Planned gross withdrawal. Use this or net_amount_needed.", false), 1, 10000000),
                    Bounded(Prop("state_rate_percent", "number", "State income tax rate. Default 0.", false), 0, 20),
                    Bounded(Prop("federal_withholding_percent", "number", "Federal withholding the user elected, if different from the default. At least 20 for rollover_eligible.", false), 0, 100),
                    Bounded(Prop("state_withholding_percent", "number", "State withholding at payout. Default 0.", false), 0, 20),
                    Bounded(Prop("withdrawal_fee", "number", "Plan withdrawal fee. Default 0.", false), 0, 10000),
                    Bounded(Prop("taxable_percent", "number", "Share of the withdrawal that is taxable, for Roth or after-tax money. Default 100.", false), 0, 100),
                    Bounded(Prop("years_to_retirement", "number", "Years until retirement, to show an illustrative pre-tax future value.", false), 0, 60),
                    Bounded(Prop("assumed_annual_return_percent", "number", "Assumed annual return for the illustration. Default 6.", false), 0, 15)),
                Output(
                    Prop("gross_withdrawal", "number", "Gross withdrawal amount.", true),
                    Prop("federal_withholding", "number", "Federal tax withheld at payout.", true),
                    Prop("cash_received", "number", "Cash paid out after withholding and fee.", true),
                    Prop("total_expected_tax", "number", "Estimated total tax, including any additional tax.", true),
                    Prop("set_aside_for_tax_filing", "number", "Tax still owed at filing after withholding.", true))));
    }

    private static JObject Tool(string name, string title, string description, JObject inputSchema, JObject outputSchema)
    {
        return new JObject
        {
            ["name"] = name,
            ["title"] = title,
            ["description"] = description,
            ["inputSchema"] = inputSchema,
            ["outputSchema"] = outputSchema,
            ["annotations"] = new JObject
            {
                ["title"] = title,
                ["readOnlyHint"] = true,
                ["destructiveHint"] = false,
                ["idempotentHint"] = true,
                ["openWorldHint"] = false
            }
        };
    }

    private sealed class PropertySpec
    {
        public string Name;
        public JObject Schema;
        public bool Required;
    }

    private static PropertySpec Prop(string name, string type, string description, bool required)
    {
        return new PropertySpec
        {
            Name = name,
            Schema = new JObject { ["type"] = type, ["description"] = description },
            Required = required
        };
    }

    private static PropertySpec Bounded(PropertySpec prop, double min, double max)
    {
        prop.Schema["minimum"] = min;
        prop.Schema["maximum"] = max;
        return prop;
    }

    private static PropertySpec OneOf(PropertySpec prop, JArray values)
    {
        prop.Schema["enum"] = values;
        return prop;
    }

    private static JObject Schema(params PropertySpec[] props)
    {
        JObject properties = new JObject();
        foreach (PropertySpec prop in props) properties[prop.Name] = prop.Schema;
        return new JObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = new JArray(props.Where(p => p.Required).Select(p => p.Name).ToArray())
        };
    }

    // Output schemas list the fields every result includes. Results may add steps and other fields.
    private static JObject Output(params PropertySpec[] props)
    {
        JObject schema = Schema(props);
        schema["additionalProperties"] = true;
        return schema;
    }

    // ── Input helpers ────────────────────────────────────────────────────────

    private static bool Has(JObject args, string key)
    {
        JToken token = args[key];
        return token != null && token.Type != JTokenType.Null && token.ToString().Trim().Length > 0;
    }

    private static double Number(JObject args, string key, double? fallback, double min, double max)
    {
        if (!Has(args, key))
        {
            if (fallback.HasValue) return fallback.Value;
            throw new InputException(key + " is required.");
        }

        JToken token = args[key];
        double value;
        if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
        {
            value = token.Value<double>();
        }
        else
        {
            string cleaned = token.ToString().Replace("$", string.Empty).Replace(",", string.Empty).Replace("%", string.Empty).Trim();
            try
            {
                value = new JValue(cleaned).Value<double>();
            }
            catch (FormatException)
            {
                throw new InputException(key + " must be a number.");
            }
            catch (OverflowException)
            {
                throw new InputException(key + " is too large.");
            }
        }

        if (double.IsNaN(value) || double.IsInfinity(value) || value < min || value > max)
            throw new InputException(key + " must be between " + Plain(min) + " and " + Plain(max) + ".");
        return value;
    }

    private static double WholeNumber(JObject args, string key, double min, double max)
    {
        double value = Number(args, key, null, min, max);
        if (value != Math.Floor(value)) throw new InputException(key + " must be a whole number.");
        return value;
    }

    private static bool Flag(JObject args, string key, bool? fallback)
    {
        if (!Has(args, key))
        {
            if (fallback.HasValue) return fallback.Value;
            throw new InputException(key + " is required (true or false).");
        }
        JToken token = args[key];
        if (token.Type == JTokenType.Boolean) return token.Value<bool>();
        string text = token.ToString().Trim().ToLowerInvariant();
        if (text == "true" || text == "yes") return true;
        if (text == "false" || text == "no") return false;
        throw new InputException(key + " must be true or false.");
    }

    private static string Text(JObject args, string key, string fallback)
    {
        return Has(args, key) ? args[key].ToString().Trim().ToLowerInvariant() : fallback;
    }

    // ── Number helpers ───────────────────────────────────────────────────────

    private static double RoundCents(double value)
    {
        return Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static double FloorCents(double value)
    {
        return Math.Floor(Math.Round(value * 100, 6)) / 100;
    }

    private static double Cents(double value)
    {
        return RoundCents(value);
    }

    // Formatting avoids culture-specific separators so results read the same on every host.
    private static string Plain(double value)
    {
        if (value == Math.Floor(value) && Math.Abs(value) < 1e15) return ((long)value).ToString();
        return new JValue(value).ToString(Newtonsoft.Json.Formatting.None);
    }

    private static string Money(double value)
    {
        long cents = (long)Math.Round(Math.Abs(value) * 100, MidpointRounding.AwayFromZero);
        string dollars = (cents / 100).ToString();
        StringBuilder grouped = new StringBuilder();
        for (int i = 0; i < dollars.Length; i++)
        {
            if (i > 0 && (dollars.Length - i) % 3 == 0) grouped.Append(',');
            grouped.Append(dollars[i]);
        }
        string sign = value < 0 && cents > 0 ? "-" : string.Empty;
        return sign + "$" + grouped + "." + (cents % 100).ToString("00");
    }

    // ── JSON-RPC helpers ─────────────────────────────────────────────────────

    private static JObject Success(JToken id, JObject result)
    {
        return new JObject { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result };
    }

    private static JObject Error(JToken id, int code, string message)
    {
        return new JObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id,
            ["error"] = new JObject { ["code"] = code, ["message"] = message }
        };
    }

    private sealed class InputException : Exception
    {
        public InputException(string message) : base(message) { }
    }
}
