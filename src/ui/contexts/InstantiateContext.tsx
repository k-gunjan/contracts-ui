// Copyright 2022 @paritytech/contracts-ui authors & contributors
// SPDX-License-Identifier: GPL-3.0-only

import { createContext, useState, useContext, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ContractInstantiateResult } from '@polkadot/types/interfaces';
import {
  BN_THOUSAND,
  onInsantiateFromHash,
  onInstantiateFromCode,
  createInstantiateTx,
  NOOP,
  transformUserInput,
  maximumBlockWeight,
} from 'helpers';
import {
  InstantiateProps,
  InstantiateState,
  CodeSubmittableResult,
  BlueprintSubmittableResult,
  InstantiateData,
  ContractPromise,
  BlueprintPromise,
  SubmittableExtrinsic,
  OnInstantiateSuccess$Code,
  OnInstantiateSuccess$Hash,
  Step2FormData,
  ApiPromise,
} from 'types';
import { useStepper } from 'ui/hooks/useStepper';
import { useDatabase } from 'ui/contexts/DatabaseContext';

type TxState = [
  SubmittableExtrinsic<'promise'> | null,
  OnInstantiateSuccess$Code | OnInstantiateSuccess$Hash,
  string | null
];

const initialData: InstantiateData = {
  constructorIndex: 0,
  value: BN_THOUSAND,
  name: '',
  weight: BN_THOUSAND,
};

const initialState = {
  data: initialData,
  currentStep: 1,
  tx: null,
  onError: NOOP,
  onSuccess: NOOP,
  onInstantiate: () => Promise.resolve(),
} as unknown as InstantiateState;

const InstantiateContext = createContext(initialState);

export function isResultValid({
  contract,
}: CodeSubmittableResult<'promise'> | BlueprintSubmittableResult<'promise'>): boolean {
  return !!contract;
}

export function InstantiateContextProvider({
  children,
}: React.PropsWithChildren<Partial<InstantiateProps>>) {
  const navigate = useNavigate();
  const dbState = useDatabase();
  const NOOP = () => Promise.resolve();
  const { codeHash: codeHashUrlParam } = useParams<{ codeHash: string }>();
  const [currentStep, stepForward, stepBackward, setStep] = useStepper(initialState.currentStep);

  const [data, setData] = useState<InstantiateData>(initialState.data);
  const [[tx, onInstantiate], setTx] = useState<TxState>([null, NOOP, null]);
  const [dryRunResult, setDryRunResult] = useState<ContractInstantiateResult>();

  const onSuccess = useCallback(
    (contract: ContractPromise, _?: BlueprintPromise | undefined) => {
      navigate(`/contract/${contract.address}`);
    },

    [navigate]
  );

  const onFinalize = (formData: Partial<InstantiateData>, api: ApiPromise) => {
    const newData = { ...data, ...formData };
    try {
      const tx = createInstantiateTx(api, newData);

      const onInstantiate = (codeHashUrlParam ? onInsantiateFromHash : onInstantiateFromCode)(
        dbState,
        newData,
        onSuccess
      );
      setTx([tx, onInstantiate, null]);
      setData(newData);
      stepForward();
    } catch (e) {
      console.error(e);

      setTx([null, NOOP, 'Error creating transaction']);
    }
  };

  const onFormChange = useCallback(
    async (formData: Step2FormData, api: ApiPromise) => {
      try {
        const constructor = data.metadata?.findConstructor(formData.constructorIndex);

        const inputData = constructor?.toU8a(
          transformUserInput(api.registry, constructor.args, formData.argValues)
        );

        const params = {
          origin: data.accountId,
          gasLimit: formData.weight || maximumBlockWeight(api),
          storageDepositLimit: formData.storageDepositLimit,
          code: codeHashUrlParam
            ? { Existing: codeHashUrlParam }
            : { Upload: data.metadata?.info.source.wasm },
          data: inputData,
          salt: formData.salt || undefined,
          value: formData.value ? api.registry.createType('Balance', formData.value) : null,
        };

        if (params.origin) {
          const result = await api.rpc.contracts.instantiate(params);

          setDryRunResult(result);
        }
      } catch (e) {
        console.error(e);
      }
    },
    [codeHashUrlParam, data.accountId, data.metadata]
  );

  function onUnFinalize() {
    setTx([null, NOOP, null]);
    setStep(2);
  }

  const value: InstantiateState = {
    data,
    setData,
    currentStep,
    dryRunResult,
    setStep,
    stepForward,
    stepBackward,
    onSuccess,
    onUnFinalize,
    onFinalize,
    onFormChange,
    tx,
    onInstantiate,
    onError: NOOP,
  };

  return <InstantiateContext.Provider value={value}>{children}</InstantiateContext.Provider>;
}

export const useInstantiate = () => useContext(InstantiateContext);
