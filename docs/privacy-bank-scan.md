# Bank scan: how your data is handled

The bank scan is optional. It looks at where you have spent money so we can show you
class action lawsuits that name those companies. You do not need an account to use it,
and we keep nothing from it.

## How it works

1. You tap **Scan my bank** and pick your bank in a window run by **Plaid**, a
   company that connects apps to banks. You sign in to your bank inside Plaid's window.
   We never see your bank username or password.
2. Plaid gives our server a one-time, temporary key to read your transactions.
3. Our server reads up to the last 24 months of transactions and picks out the
   **names of the businesses** you paid (for example Netflix, Verizon, Amazon).
4. We immediately tell Plaid to **disconnect** your bank. This happens every time,
   even if the scan fails or times out.
5. Your browser or phone receives only a list of business names, a general category
   (like "coffee" or "telephone"), and how sure we are about each one. You review that
   list before anything is matched to lawsuits.

The whole scan usually takes under a minute.

## What we access

Read-only access, through Plaid, to your transaction history: business names, amounts,
dates, and Plaid's spending categories. Plaid also sends basic account information
(such as account names and balances) along with transactions; we ignore it. We cannot
move money, and we do not request your identity details or account and routing numbers.

We only use the business names and categories. We skip things that are not purchases
from a company: paychecks, transfers between your accounts, ATM withdrawals, interest,
bank fees, rent, tax payments, and payments to people through apps like Venmo, Zelle or
Cash App.

## What we keep

**Nothing.**

- No account is created. Each scan uses a random, one-time ID, so scans cannot be linked
  to you or to each other.
- Transactions are handled only in the server's memory while the scan runs, then thrown
  away. They are never written to a database, file, or log.
- Amounts, dates, and account details never leave our server, not even to your own
  device. Only the list of business names is sent back.
- We do not keep the bank connection key. It is deleted when the scan ends.
- We do not log your bank connection, the businesses found, or your transactions.

To prevent abuse, our server briefly counts how many scans come from the same network
address. It stores a scrambled version of that address, not the address itself, in
memory for about 10 minutes.

## When the connection is removed

Right after your transactions are read, in the same request, we ask Plaid to remove
the connection ("item removal"). After that, neither we nor Plaid can use it to read
your bank again. If you want to scan again later, you connect again from scratch.

If something goes wrong partway (your bank is slow, the scan times out), we still remove
the connection before returning the error.

## What Plaid does

Plaid is a separate company with its own privacy policy
(<https://plaid.com/legal/#end-user-privacy-policy>). You can see and manage any
connections Plaid holds for you at <https://my.plaid.com>.

## Keep in mind

Bank records show the business you paid, not the exact product. A scan can tell us you
shop at Walmart or pay Verizon, but not which toothpaste you bought. For product-level
matches, use the photo scan or the "What do you own?" box.

We provide information about lawsuits, not legal advice. We never file claims for you.
