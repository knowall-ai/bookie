namespace KnowAll.Bookie.Bitcoin;

/// <summary>
/// Which addresses a bare xpub (or tpub) makes. ypub/zpub keys and output descriptors
/// already say so: leave those on Automatic. Bookie reads the value names.
/// </summary>
enum 50250 "Bookie BTC Script Type"
{
    Extensible = false;
    Caption = 'Bitcoin Script Type';

    value(0; Automatic)
    {
        Caption = 'Automatic (from the key prefix or descriptor)';
    }
    value(1; WPKH)
    {
        Caption = 'Native SegWit (wpkh) bc1q...';
    }
    value(2; SHWPKH)
    {
        Caption = 'Nested SegWit (sh-wpkh) 3...';
    }
    value(3; TR)
    {
        Caption = 'Taproot (tr) bc1p...';
    }
    value(4; WSHMulti)
    {
        Caption = 'Multisig (wsh-multi) needs a descriptor';
    }
    value(5; PKH)
    {
        Caption = 'Legacy (pkh) 1...';
    }
}
