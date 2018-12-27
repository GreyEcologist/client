import { crypto } from '@graphprotocol/graph-ts'
import gql from 'graphql-tag'
import { Observable, of } from 'rxjs'
import { Arc } from './arc'
import { DAO } from './dao'
import {
  IProposalQueryOptions,
  IStake,
  IStakeQueryOptions,
  IVote,
  IVoteQueryOptions,
  Proposal
} from './proposal'
import { IRewardQueryOptions, Reward } from './reward'
import { Address, ICommonQueryOptions, IStateful } from './types'
const sha3 = require('js-sha3')

export interface IMemberState {
  address: Address
  dao: DAO
  id: string
  eth: number
  reputation: number
  tokens: number
  gen: number
  approvedGen: number
}

/**
 * Represents a user of a DAO
 */

export class Member implements IStateful<IMemberState> {
  public state: Observable<IMemberState> = of()

  /**
   * [constructor description]
   * @param address address of the user
   * @param dao     address of the DAO
   */
  constructor(public address: Address, public dao: Address, public context: Arc) {
    this.address = address

    const id = sha3.keccak256(address + dao) // TODO: this produce wrong ID

    // TODO: Add support for eth, gen, approvedGen, tokens
    // TODO: Fix subgraph issues with tokens and reputation
    const query = gql`{
      member(id: "${id}") {
        id
        address
        dao {
          id
        }
        reputation
      }
    }`

    const itemMap = (item: any): IMemberState => {
      if (item === null) {
        throw Error(`Could not find a Member of DAO ${dao} with address ${address}`)
      }
      return {
        address: item.address,
        approvedGen: 0, // TODO: FIXME
        dao: new DAO(item.dao.id, context),
        eth: 0, // TODO: FIXME
        gen: 0, // TODO: FIXME
        id: item.id,
        reputation: item.reputation,
        tokens: 0 // TODO: FIXME
      }
    }
    this.state = this.context._getObservableObject(query, 'member', itemMap) as Observable<IMemberState>
  }

  public rewards(options: IRewardQueryOptions): Observable<Reward[]> {
    const dao = new DAO(this.dao.toString(), this.context)
    //options.proposer = this.address
    return dao.rewards(options)
  }

  public proposals(options: IProposalQueryOptions = {}): Observable<Proposal[]> {
    const dao = new DAO(this.dao.toString(), this.context)
    //options.proposer = this.address
    return dao.proposals(options)
  }

  public stakes(options: IStakeQueryOptions = {}): Observable<IStake[]> {
    throw new Error('not implemented')
    // const dao = new DAO(this.dao)
    // return dao.stakes(options)
  }

  public votes(options: IVoteQueryOptions = {}): Observable<IVote[]> {
    throw new Error('not implemented')
    // const dao = new DAO(this.dao)
    // return dao.votes(options)
  }
}

export interface IMemberQueryOptions extends ICommonQueryOptions {
  address?: Address
  dao?: Address
  [key: string]: any
}
