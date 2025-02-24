import {FilterFn} from "@react-stately/combobox";
import {RefObject, useState} from "react";
import {MenuTriggerAction} from "@react-types/combobox";
import {
  AsyncLoadable,
  CollectionBase,
  DOMProps,
  FocusableProps,
  HelpTextProps,
  InputBase,
  LabelableProps,
  MultipleSelection,
  TextInputBase,
  Validation,
  Selection,
  FocusStrategy,
  Collection,
  Node,
} from "@react-types/shared";
import {OverlayTriggerProps} from "@react-types/overlays";
import {useMultiSelectListState} from "@heroui/use-aria-multiselect";
import {useControlledState} from "@react-stately/utils";
import {useMenuTriggerState} from "@react-stately/menu";
import {useFormValidationState} from "@react-stately/form";
import {ListCollection} from "@react-stately/list";
import {getChildNodes} from "@react-stately/collections";

export interface MultiselectAutocomplete extends MultipleSelection {
  /** The value of the ComboBox input (controlled). */
  inputValue?: string;
  /** The default value of the ComboBox input (uncontrolled). */
  defaultInputValue?: string;
  /** Handler that is called when the ComboBox input value changes. */
  onInputChange?: (value: string) => void;
  setInputValue: (value: string) => void;
  /**
   * The interaction required to display the ComboBox menu.
   * @default 'input'
   */
  menuTrigger?: MenuTriggerAction;
  /** Method that is called when the open state of the menu changes. Returns the new open state and the action that caused the opening of the menu. */
  onOpenChange?: (isOpen: boolean, menuTrigger?: MenuTriggerAction) => void;
  /** The filter function used to determine if a option should be included in the combo box list. */
  defaultFilter?: FilterFn;
  validationBehavior?: "aria" | "native";
  shouldCloseOnBlur?: boolean;
  allowsEmptyCollection?: boolean;
  allowsCustomValue?: boolean;
  /** Commit Trigger when click enter **/
  inputRef?: RefObject<HTMLInputElement>;
  listBoxRef?: RefObject<HTMLUListElement>;
}

export interface MultiSelectAutoCompleteProps<T>
  extends CollectionBase<T>,
    AsyncLoadable,
    InputBase,
    DOMProps,
    HelpTextProps,
    Omit<Validation<T>, "validationBehavior" | "validate">,
    LabelableProps,
    TextInputBase,
    FocusableProps,
    Omit<OverlayTriggerProps, "onOpenChange">,
    MultiselectAutocomplete {
  /**
   * Whether the menu should automatically flip direction when space is limited.
   * @default true
   */
  shouldFlip?: boolean;
}

export function useMultiselectAutocompleteState<T extends object>(
  props: MultiSelectAutoCompleteProps<T>,
) {
  let [inputValue, setInputValue] = useControlledState(
    props.inputValue,
    props.defaultInputValue || "",
    (value) => {
      open();
      props.onInputChange?.(value);
    },
  );

  const [isFocused, setFocused] = useState(false);
  const [focusStrategy, setFocusStrategy] = useState<FocusStrategy | null>(null);

  const triggerState = useMenuTriggerState(props);

  const onSelectionChange = (keys: Selection) => {
    if (props.onSelectionChange != null) {
      if (keys === "all") {
        // This may change back to "all" once we will implement async loading of additional
        // items and differentiation between "select all" vs. "select visible".
        props.onSelectionChange(new Set(listState.collection.getKeys()));
      } else {
        props.onSelectionChange(keys);
      }
    }

    // Multi select stays open after item selection
    if (props.selectionMode === "single") {
      triggerState.close();
      if (keys && keys !== "all" && keys.keys()?.next()?.value) {
        const item = listState.selectionManager.getItemProps(keys.keys().next().value!);

        setInputValue(item.textValue || item.children);
        close();
      }
    }

    if (props.selectionMode === "multiple") {
      if (props.onInputChange) {
        props.onInputChange("");
      } else {
        setInputValue("");
      }
    }
  };

  const listState = useMultiSelectListState({
    ...props,
    onSelectionChange,
  });

  const originalCollection = listState.collection;
  const filteredCollection = props.defaultFilter
    ? new ListCollection(
        filterNodes(listState.collection, listState.collection, inputValue, props.defaultFilter),
      )
    : listState;

  const validationState = useFormValidationState({
    ...props,
    // TODO: Future enhancement to support "aria" validation behavior.
    validationBehavior: "native",
    value: listState.selectedKeys,
  });

  const open = (focusStrategy: FocusStrategy | null = null) => {
    // Don't open if the collection is empty.
    if (listState.collection.size !== 0) {
      setFocusStrategy(focusStrategy);
      triggerState.open();
    }
  };

  const close = () => {
    triggerState.close();
    setInputValue("");
  };

  const toggle = (focusStrategy: FocusStrategy | null = null) => {
    if (listState.collection.size !== 0) {
      setFocusStrategy(focusStrategy);
      triggerState.toggle();
      validationState.commitValidation();
    }
  };

  const commit = () => {
    const activeItem =
      props.inputRef?.current?.attributes.getNamedItem("aria-activedescendant")?.value;

    if (activeItem) {
      const selectedKey = activeItem.split("option-")[1];

      if (listState.selectedKeys.has(selectedKey)) {
        listState.selectedKeys.delete(selectedKey);
        if (props.selectionMode === "single") {
          setInputValue("");
        }
      } else {
        if (props.selectionMode === "single") {
          listState.selectionManager.replaceSelection(selectedKey);
        } else {
          listState.selectedKeys.add(selectedKey);
        }
      }
      onSelectionChange(listState.selectedKeys);
      validationState.commitValidation();
    }
  };

  const revert = () => {
    close();
  };

  const displayedCollection =
    triggerState.isOpen && inputValue ? filteredCollection : originalCollection;

  return {
    ...validationState,
    ...listState,
    ...triggerState,
    focusStrategy,
    close,
    open,
    toggle,
    isFocused,
    setFocused,
    inputValue,
    setInputValue,
    commit,
    revert,
    placeholder:
      listState.selectionMode === "multiple" && listState.selectedKeys.size > 0
        ? listState.selectedItems?.map((item) => item.textValue || item).join(", ")
        : "",
    collection: displayedCollection,
    ...(props.isReadOnly && {disabledKeys: new Set([...listState.collection.getKeys()])}),
  };
}

function filterNodes<T>(
  collection: Collection<Node<T>>,
  nodes: Iterable<Node<T>>,
  inputValue: string,
  filter: FilterFn,
): Iterable<Node<T>> {
  let filteredNode: Node<T>[] = [];

  for (let node of nodes) {
    if (node.type === "section" && node.hasChildNodes) {
      let filtered = filterNodes(collection, getChildNodes(node, collection), inputValue, filter);

      if ([...filtered].some((node) => node.type === "item")) {
        filteredNode.push({...node, childNodes: filtered});
      }
    } else if (node.type === "item" && filter(node.textValue, inputValue)) {
      filteredNode.push({...node});
    } else if (node.type !== "item") {
      filteredNode.push({...node});
    }
  }

  return filteredNode;
}
