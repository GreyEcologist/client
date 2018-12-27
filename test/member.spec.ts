import { Arc } from '../src/arc'
import { Member } from '../src/member'
import { getArc, getContractAddresses, getOptions, getWeb3, nullAddress } from './utils'
import { first } from 'rxjs/operators';

/**
 * Member test
 */
describe('Member', () => {
  let arc: Arc
  let web3: any
  let accounts: any

  beforeAll(async () => {
    arc = getArc()
    web3 = await getWeb3()
    accounts = web3.eth.accounts.wallet
    web3.eth.defaultAccount = accounts[0].address
  })

  it('Member is instantiable', async () => {
    const address = '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1'
    const daoAddress = '0x46d6cdc1dc33a3bf63bb2e654e5622173365ed6a'

    const member = new Member(address, daoAddress, arc)
    // const proposals = await member.proposals().pipe(first()).toPromise()
    expect(member).toBeInstanceOf(Member)
    expect(member.address).toBe(address)
    expect(member.dao).toBe(daoAddress)
    // expect(proposals.length).toBeGreaterThan(0)
  })
})
