"""Tests for deep object unpacking in safe_repr (SQLAlchemy, Pydantic, Dataclass, Namedtuple)."""
import dataclasses
from collections import namedtuple
from pydebug.core.tracer import safe_repr


def test_safe_repr_scalars():
    assert safe_repr(42) == "42"
    assert safe_repr(3.14) == "3.14"
    assert safe_repr("hello") == "'hello'"
    assert safe_repr(True) == "True"
    assert safe_repr(None) == "None"


def test_safe_repr_dataclass():
    @dataclasses.dataclass
    class User:
        id: int
        username: str
        is_active: bool

    u = User(id=1, username="alice", is_active=True)
    r = safe_repr(u)
    assert "User(" in r
    assert "id=1" in r
    assert "username='alice'" in r
    assert "is_active=True" in r


def test_safe_repr_namedtuple():
    Point = namedtuple("Point", ["x", "y"])
    p = Point(10, 20)
    r = safe_repr(p)
    assert "Point(" in r
    assert "x=10" in r
    assert "y=20" in r


def test_safe_repr_sqlalchemy_like_model():
    class PolicyBenefit:
        def __init__(self):
            # Internal SQLAlchemy state attribute must be stripped
            self._sa_instance_state = "<InstanceState object at 0x999>"
            self.id = 92
            self.benefit_id = 13
            self.policy_id = 5
            self.coverage_type = "base"
            self.coverage_amount = 50000.0

    b = PolicyBenefit()
    r = safe_repr(b)
    assert "PolicyBenefit(" in r
    assert "id=92" in r
    assert "benefit_id=13" in r
    assert "policy_id=5" in r
    assert "coverage_type='base'" in r
    assert "_sa_instance_state" not in r


def test_safe_repr_list_of_models():
    class PolicyBenefit:
        def __init__(self, idx, b_id):
            self._sa_instance_state = "<internal>"
            self.id = idx
            self.benefit_id = b_id

    b1 = PolicyBenefit(1, 101)
    b2 = PolicyBenefit(2, 102)
    items = [b1, b2]

    r = safe_repr(items)
    assert r.startswith("[PolicyBenefit(")
    assert "id=1" in r
    assert "id=2" in r
    assert "_sa_instance_state" not in r


def test_safe_repr_slots_class():
    class SlotItem:
        __slots__ = ["name", "value", "_hidden"]

        def __init__(self, name, value):
            self.name = name
            self.value = value
            self._hidden = "secret"

    item = SlotItem("test", 123)
    r = safe_repr(item)
    assert "SlotItem(" in r
    assert "name='test'" in r
    assert "value=123" in r
    assert "_hidden" not in r


def test_safe_repr_circular_reference():
    class Node:
        def __init__(self, name):
            self.name = name
            self.next = None

    n1 = Node("n1")
    n2 = Node("n2")
    n1.next = n2
    n2.next = n1  # Cycle

    r = safe_repr(n1)
    assert "Node(" in r
    assert "name='n1'" in r

